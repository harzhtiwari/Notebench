import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SESSION_COOKIE_NAME_HTTP,
  SESSION_COOKIE_NAME_SECURE,
  buildSessionCookieOptions,
  isSecureRequest,
  resolveSessionCookieName,
  type SessionService,
} from "@notebench/domain-account";
import type { SessionRecord } from "@notebench/contracts";

export interface SessionSupportOptions {
  sessionService: SessionService;
  /**
  Direct signing secret override (tests, deployments). Takes precedence.
  */
  cookieSecret?: string | undefined;
  /**
  Vault directory holding cookie.key. Defaults to <workspace>/.notebook/vault.
  */
  vaultDir?: string | undefined;
  /**
  Environment source. Defaults to process.env; injectable for tests.
  */
  env?: Record<string, string | undefined> | undefined;
}

/**
File holding the persisted cookie signing secret (research 11 §3.1).
*/
export const COOKIE_KEY_FILE_NAME = "cookie.key";

/**
Minimum accepted secret length (32 characters) per the signing guidance
of at least 20 bytes of key material.
*/
const MIN_COOKIE_SECRET_LENGTH = 32;

export type CookieSecretSource = "option" | "env" | "file" | "generated";

/**
Locates the workspace root by walking up to pnpm-workspace.yaml,
falling back to the start directory (mirrors resolveWebOutDir).
*/
function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(startDir);
    }
    dir = parent;
  }
}

function assertSecretLength(secret: string, source: string): void {
  if (secret.length < MIN_COOKIE_SECRET_LENGTH) {
    throw new Error(
      `Cookie signing secret from ${source} must be at least ${MIN_COOKIE_SECRET_LENGTH} characters long.`
    );
  }
}

/**
Resolves the HMAC cookie signing secret (research 11 §3.1):
explicit option, then NOTEBOOK_COOKIE_SECRET, then the persisted
`.notebook/vault/cookie.key` file, else a generated secret that is
persisted for subsequent boots so sessions survive restarts.
*/
export function resolveCookieSecret(
  options: {
    cookieSecret?: string | undefined;
    vaultDir?: string | undefined;
    env?: Record<string, string | undefined> | undefined;
  } = {}
): { secret: string; source: CookieSecretSource } {
  if (options.cookieSecret !== undefined && options.cookieSecret !== "") {
    assertSecretLength(options.cookieSecret, "option");
    return { secret: options.cookieSecret, source: "option" };
  }

  const env = options.env ?? process.env;
  const envSecret = env["NOTEBOOK_COOKIE_SECRET"];
  if (envSecret !== undefined && envSecret !== "") {
    assertSecretLength(envSecret, "environment");
    return { secret: envSecret, source: "env" };
  }

  const dir =
    options.vaultDir ?? path.join(findWorkspaceRoot(), ".notebook", "vault");
  const keyPath = path.join(path.resolve(dir), COOKIE_KEY_FILE_NAME);
  if (existsSync(keyPath)) {
    const stored = readFileSync(keyPath, "utf8").trim();
    assertSecretLength(stored, `file ${keyPath}`);
    return { secret: stored, source: "file" };
  }

  const generated = randomBytes(32).toString("hex");
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, `${generated}\n`, { mode: 0o600 });
  return { secret: generated, source: "generated" };
}

export interface RequestSession {
  record: SessionRecord;
  rawToken: string;
}

/**
Registers cookie parsing/signing for session cookies. Must run before any
hook that reads cookies (the plugin parses on `onRequest`).
*/
export async function registerSessionSupport(
  app: FastifyInstance,
  options: SessionSupportOptions
): Promise<void> {
  const { secret } = resolveCookieSecret(options);
  await app.register(cookie, { secret });
}

/**
HTTPS detection for cookie naming (NOTEBENCH 6.5): direct TLS or
`X-Forwarded-Proto: https` from a reverse proxy.
*/
export function isRequestSecure(
  protocol: string | undefined,
  forwardedProto: string | string[] | undefined
): boolean {
  return isSecureRequest(protocol, forwardedProto);
}

/**
Reads the session cookie, accepting both the `__Host-` (HTTPS) and plain
(HTTP) names so scheme transitions never hard-lock the owner out.
*/
function readSessionCookie(request: FastifyRequest): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  return cookies ? cookies[SESSION_COOKIE_NAME_SECURE] ?? cookies[SESSION_COOKIE_NAME_HTTP] : undefined;
}

/**
Issues (or renews) the sliding session cookie for a raw token.
*/
export function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  isSecure: boolean
): void {
  reply.setCookie(resolveSessionCookieName(isSecure), rawToken, {
    ...buildSessionCookieOptions(isSecure),
  });
}

/**
Renews the sliding cookie for an already-resolved request session. Shared by
the global guard and the session-management routes so renewal has one shape
(Ticket 02 / NOTEBENCH 6.5).
*/
export function renewSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  session: RequestSession
): void {
  setSessionCookie(
    reply,
    session.rawToken,
    isRequestSecure(request.protocol, request.headers["x-forwarded-proto"])
  );
}

/**
Clears both session cookie names (scheme transitions may leave either behind).
The `__Host-` clearing header must carry `Secure`: RFC 6265bis §5.7 makes a
browser ignore any Set-Cookie for a `__Host-` name without it, which would
leave the stale cookie alive until its Max-Age lapses (Ticket 02).
*/
export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME_SECURE, { path: "/", secure: true });
  reply.clearCookie(SESSION_COOKIE_NAME_HTTP, { path: "/" });
}

/**
Resolves and validates the request session, renewing its sliding expiry.
Returns null when no usable session is presented.
*/
export async function resolveRequestSession(
  request: FastifyRequest,
  sessionService: SessionService
): Promise<RequestSession | null> {
  const signed = readSessionCookie(request);
  if (!signed) {
    return null;
  }
  const unsigned = request.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) {
    return null;
  }
  const record = await sessionService.validateSession(unsigned.value);
  return record ? { record, rawToken: unsigned.value } : null;
}

/**
API paths that never require a session: setup, health probes and the
session routes themselves. Everything else under /api/ is protected, and
non-API paths (static SPA assets) are never gated here.
*/
export function isProtectedApiRoute(url: string): boolean {
  const pathname = url.split("?", 1)[0] ?? url;
  return !(pathname === "/setup" || pathname === "/api/setup" || pathname === "/api/app-state" || pathname === "/api/session" || !pathname.startsWith("/api/") || pathname.startsWith("/api/session/"));
}

/**
Single global session hook used by all protected routes (no per-route copies).
Open when the owner has no passcode (ticket 01 zero-auth mode); otherwise a
missing/invalid session is a stable 401 and every authenticated request
renews the sliding cookie.
*/
export function createSessionGuard(deps: {
  sessionService: SessionService;
  isPasscodeRequired: () => Promise<boolean>;
}): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    if (!isProtectedApiRoute(request.url) || !(await deps.isPasscodeRequired())) {
      return;
    }
    const session = await resolveRequestSession(request, deps.sessionService);
    if (!session) {
      await reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Valid session required. Sign in with the owner passcode.",
        },
      });
      return;
    }
    renewSessionCookie(reply, request, session);
  };
}
