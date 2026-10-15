import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createSqliteDatabase, SqliteAccountRepository, SqliteSessionRepository } from "@notebook/infra-db";
import type { SqliteDatabaseInstance } from "@notebook/infra-db";
import {
  OwnerSetupService,
  FakePasscodeHasher,
  SessionService,
} from "@notebook/domain-account";
import { buildServer } from "./app.js";

const TEST_DIR = resolve(`.tmp/test/test-server-session-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
 * Windows holds file locks briefly after sqlite handles close, longer under
 * parallel suites: retry transient lock errors with a generous budget.
 */
async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}
const PASSCODE = "a-very-secure-passcode-phrase-here";

function parseSetCookies(
  header: string | string[] | undefined
): Array<{ name: string; value: string; attrs: string }> {
  const lines = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return lines.map((line) => {
    const [pair, ...rest] = line.split(";");
    const eq = (pair ?? "").indexOf("=");
    return {
      name: (pair ?? "").slice(0, eq),
      value: (pair ?? "").slice(eq + 1),
      attrs: (rest ?? []).join(";"),
    };
  });
}

describe("Session routes, cookies and lockout (Ticket 02 - RED Phase)", () => {
  let app: FastifyInstance | undefined;
  let sqliteInstance: SqliteDatabaseInstance | undefined;
  let testDbPath: string;
  let nowMs: number;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry(TEST_DIR);
    }
    mkdirSync(TEST_DIR, { recursive: true });
    testDbPath = join(TEST_DIR, `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    nowMs = 1_700_000_000_000;
  }, 120_000);

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = undefined;
    }
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry(TEST_DIR);
      } catch {
        // Non-fatal if OS locks transitioning
      }
    }
  }, 120_000);

  async function boot(): Promise<{
    sessionService: SessionService;
    ownerSetupService: OwnerSetupService;
  }> {
    sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const accountRepo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const sessionRepo = new SqliteSessionRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: accountRepo, hasher });
    const sessionService = new SessionService({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      hasher,
      now: () => nowMs,
    });
    await ownerSetupService.setupOwner({ displayName: "Owner", passcode: PASSCODE });
    app = await buildServer({
      ownerSetupService,
      sessionService,
      cookieSecret: "test-cookie-signing-secret-32-chars-ok",
      logger: false,
    });
    await app.ready();
    return { sessionService, ownerSetupService };
  }

  function server(): FastifyInstance {
    if (!app) {
      throw new Error("Test server was not started");
    }
    return app;
  }

  async function loginCookie(extraHeaders?: Record<string, string>): Promise<string> {
    const res = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
      ...(extraHeaders === undefined ? {} : { headers: extraHeaders }),
    });
    expect(res.statusCode).toBe(200);
    const cookies = parseSetCookies(res.headers["set-cookie"]);
    expect(cookies.length).toBeGreaterThan(0);
    const session = cookies[0];
    if (!session) throw new Error("missing session cookie");
    return `${session.name}=${session.value}`;
  }

  it("correct passcode opens a session; wrong passcode does not", async () => {
    await boot();

    const ok = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).success).toBe(true);

    const bad = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: "incorrect-passphrase-guessed-ok" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("locks out on the sixth attempt and resumes after 60s", async () => {
    await boot();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await server().inject({
        method: "POST",
        url: "/api/session/login",
        payload: { passcode: `wrong-passphrase-number-${attempt}-ok` },
      });
      expect(res.statusCode).toBe(401);
    }
    const locked = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
    });
    expect(locked.statusCode).toBe(429);
    expect(JSON.parse(locked.body).error.details.retryAfterSeconds).toBe(60);

    nowMs += 61_000;
    const resumed = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
    });
    expect(resumed.statusCode).toBe(200);
  });

  it("sets HttpOnly Lax Path=/ cookies with HTTP/HTTPS-aware names", async () => {
    await boot();

    const httpRes = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
    });
    const httpCookies = parseSetCookies(httpRes.headers["set-cookie"]);
    const httpSession = httpCookies.find((c) => c.name === "notebench_session");
    expect(httpSession).toBeDefined();
    expect(httpSession?.attrs).toMatch(/httponly/i);
    expect(httpSession?.attrs).toMatch(/samesite=lax/i);
    expect(httpSession?.attrs).toMatch(/path=\//i);
    expect(httpSession?.attrs.toLowerCase()).not.toContain("secure");

    const httpsRes = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
      headers: { "x-forwarded-proto": "https" },
    });
    const httpsCookies = parseSetCookies(httpsRes.headers["set-cookie"]);
    const httpsSession = httpsCookies.find((c) => c.name === "__Host-notebench_session");
    expect(httpsSession).toBeDefined();
    expect(httpsSession?.attrs.toLowerCase()).toContain("secure");
  });

  it("stores only the SHA-256 digest, never the raw token", async () => {
    sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const accountRepo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const sessionRepo = new SqliteSessionRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: accountRepo, hasher });
    const sessionService = new SessionService({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      hasher,
      now: () => nowMs,
    });
    await ownerSetupService.setupOwner({ displayName: "Owner", passcode: PASSCODE });
    app = await buildServer({
      ownerSetupService,
      sessionService,
      cookieSecret: "test-cookie-signing-secret-32-chars-ok",
      logger: false,
    });
    await app.ready();

    const res = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
    });
    const cookie = parseSetCookies(res.headers["set-cookie"])[0];
    if (!cookie) throw new Error("missing session cookie");
    const rawSigned = decodeURIComponent(cookie.value);
    const rawToken = rawSigned.split(".")[0] ?? "";
    expect(rawToken.length).toBeGreaterThan(0);

    const stored = await sessionRepo.findByTokenHash(
      createHash("sha256").update(rawToken).digest("hex")
    );
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toContain(rawToken);
  });

  it("rejects unauthenticated API access with 401 but exempts setup/health/session", async () => {
    await boot();
    const cookie = await loginCookie();

    const denied = await server().inject({ method: "GET", url: "/api/notebooks" });
    expect(denied.statusCode).toBe(401);

    const allowed = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie },
    });
    expect(allowed.statusCode).toBe(200);

    for (const url of ["/api/app-state", "/healthz", "/livez"]) {
      const res = await server().inject({ method: "GET", url });
      expect(res.statusCode).not.toBe(401);
    }

    const authedList = await server().inject({
      method: "GET",
      url: "/api/session/list",
      headers: { cookie },
    });
    expect(authedList.statusCode).toBe(200);
  });

  it("renews the sliding expiry on active requests and rejects expired sessions", async () => {
    await boot();
    let cookie = await loginCookie();

    nowMs += 24 * 3600 * 1000;
    const renewed = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie },
    });
    expect(renewed.statusCode).toBe(200);
    expect(parseSetCookies(renewed.headers["set-cookie"]).length).toBeGreaterThan(0);

    nowMs += 31 * 24 * 3600 * 1000;
    const expired = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie },
    });
    expect(expired.statusCode).toBe(401);
  });

  it("logout ends the current session; change-passcode keeps current and revokes others", async () => {
    await boot();
    const first = await loginCookie();
    const second = await loginCookie();

    const logoutRes = await server().inject({
      method: "POST",
      url: "/api/session/logout",
      headers: { cookie: first },
    });
    expect(logoutRes.statusCode).toBe(200);
    const stillDenied = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie: first },
    });
    expect(stillDenied.statusCode).toBe(401);
    const stillAllowed = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie: second },
    });
    expect(stillAllowed.statusCode).toBe(200);

    const changeRes = await server().inject({
      method: "POST",
      url: "/api/session/change-passcode",
      payload: {
        currentPasscode: PASSCODE,
        newPasscode: "a-brand-new-secure-passphrase-here",
      },
      headers: { cookie: second },
    });
    expect(changeRes.statusCode).toBe(200);

    const relogin = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: "a-brand-new-secure-passphrase-here" },
    });
    expect(relogin.statusCode).toBe(200);
    const third = parseSetCookies(relogin.headers["set-cookie"])[0];
    if (!third) throw new Error("missing session cookie");
    const thirdCookie = `${third.name}=${third.value}`;

    const everywhere = await server().inject({
      method: "POST",
      url: "/api/session/logout-everywhere",
      headers: { cookie: thirdCookie },
    });
    expect(everywhere.statusCode).toBe(200);
    const afterEverywhere = await server().inject({
      method: "GET",
      url: "/api/notebooks",
      headers: { cookie: second },
    });
    expect(afterEverywhere.statusCode).toBe(401);
  });
});
