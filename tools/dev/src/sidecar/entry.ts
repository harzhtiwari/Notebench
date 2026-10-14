import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { isAbsolute } from "node:path";
import { createCompilerApp } from "./adapter.js";
import type { CompilerApp, DevBundler } from "./adapter.js";
import { createSidecarProxy } from "./proxy.js";
import { OrchestratorError } from "../types.js";

/**
 * Development web sidecar entry (ticket 04, spec 5.8).
 *
 * One foreground HTTP server in front of an in-process Next compiler:
 * `request` routes the API prefixes to the live server first and everything
 * else to the page handler; `upgrade` reaches the compiler's own upgrade
 * handler except on API prefixes, which are rejected.
 *
 * Environment (spec 7.2; canonical name wins over the NB_ alias):
 * - NOTEBENCH_SERVER_ORIGIN: live server origin, loopback only (required).
 * - NOTEBENCH_WEB_DIST_DIR: namespaced compiler output dir, absolute
 *   (required). The Next config's sidecar branch reads the same variable.
 * - NOTEBENCH_WEB_DEV_BUNDLER: `webpack` (default) or `turbopack` opt-in.
 *   The adapter passes the selection to the Next factory (which bridges it
 *   onto the environment before the compiler boots); the entry additionally
 *   clears a leaked ambient TURBOPACK for the webpack default so the default
 *   is always webpack. Markers are restored when the sidecar closes.
 *
 * Single sidecar per process: the TURBOPACK/DIST_DIR markers live on the
 * real process environment because the compiler reads them there. In
 * production the sidecar is the orchestrator's child, so the markers never
 * leak beyond the run.
 */

export const SERVER_ORIGIN_ENV = "NOTEBENCH_SERVER_ORIGIN";
export const SERVER_ORIGIN_ENV_ALIAS = "NB_SERVER_ORIGIN";
export const WEB_DIST_DIR_ENV = "NOTEBENCH_WEB_DIST_DIR";
export const WEB_DIST_DIR_ENV_ALIAS = "NB_WEB_DIST_DIR";
export const WEB_DEV_BUNDLER_ENV = "NOTEBENCH_WEB_DEV_BUNDLER";
export const WEB_DEV_BUNDLER_ENV_ALIAS = "NB_WEB_DEV_BUNDLER";
/** Bundler switch the Next custom-server path actually honors. */
const TURBOPACK_ENV = "TURBOPACK";

export type SidecarBundler = DevBundler;

export interface SidecarEnv {
  serverOrigin: string;
  distDir: string;
  bundler: SidecarBundler;
}

function pick(
  env: Record<string, string | undefined>,
  canonical: string,
  alias: string
): string | undefined {
  const value = env[canonical] ?? env[alias];
  if (value === undefined || value === "") return undefined;
  return value;
}

export function resolveSidecarEnv(env: Record<string, string | undefined>): SidecarEnv {
  const serverOrigin = pick(env, SERVER_ORIGIN_ENV, SERVER_ORIGIN_ENV_ALIAS);
  if (serverOrigin === undefined) {
    throw new OrchestratorError(
      `Sidecar requires ${SERVER_ORIGIN_ENV} (or ${SERVER_ORIGIN_ENV_ALIAS}): live loopback server origin.`,
      1
    );
  }
  const distDir = pick(env, WEB_DIST_DIR_ENV, WEB_DIST_DIR_ENV_ALIAS);
  if (distDir === undefined) {
    throw new OrchestratorError(
      `Sidecar requires ${WEB_DIST_DIR_ENV} (or ${WEB_DIST_DIR_ENV_ALIAS}): absolute namespaced compiler output directory.`,
      1
    );
  }
  if (!isAbsolute(distDir)) {
    throw new OrchestratorError(
      `Sidecar distDir "${distDir}" must be an absolute path.`,
      1
    );
  }
  const bundlerRaw = pick(env, WEB_DEV_BUNDLER_ENV, WEB_DEV_BUNDLER_ENV_ALIAS) ?? "webpack";
  if (bundlerRaw !== "webpack" && bundlerRaw !== "turbopack") {
    throw new OrchestratorError(
      `Unknown sidecar bundler "${bundlerRaw}": expected "webpack" or "turbopack".`,
      1
    );
  }
  return { serverOrigin, distDir, bundler: bundlerRaw };
}

export interface StartSidecarOptions {
  webDir: string;
  host: string;
  port: number;
  env?: Record<string, string | undefined> | undefined;
  createApp?:
    | ((webDir: string, hostname: string, port: number, bundler: SidecarBundler) => Promise<CompilerApp>)
    | undefined;
}

export interface SidecarHandle {
  port: number;
  close: () => Promise<void>;
}

function defaultCreateApp(
  webDir: string,
  hostname: string,
  port: number,
  bundler: SidecarBundler
): Promise<CompilerApp> {
  return createCompilerApp({ webDir, hostname, port, bundler });
}

function listenOn(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("sidecar did not bind a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

export async function startSidecar(options: StartSidecarOptions): Promise<SidecarHandle> {
  const env = options.env ?? process.env;
  const resolved = resolveSidecarEnv(env);
  const createApp = options.createApp ?? defaultCreateApp;

  // Publish the markers the compiler path reads off the real environment.
  const previousDistDir = process.env[WEB_DIST_DIR_ENV];
  const previousTurbopack = process.env[TURBOPACK_ENV];
  process.env[WEB_DIST_DIR_ENV] = resolved.distDir;
  if (resolved.bundler === "turbopack") process.env[TURBOPACK_ENV] = "1";
  else delete process.env[TURBOPACK_ENV];

  const restoreEnv = (): void => {
    if (previousDistDir === undefined) delete process.env[WEB_DIST_DIR_ENV];
    else process.env[WEB_DIST_DIR_ENV] = previousDistDir;
    if (previousTurbopack === undefined) delete process.env[TURBOPACK_ENV];
    else process.env[TURBOPACK_ENV] = previousTurbopack;
  };

  let app: CompilerApp;
  try {
    app = await createApp(options.webDir, options.host, options.port, resolved.bundler);
    await app.prepare();
  } catch (error: unknown) {
    restoreEnv();
    throw error;
  }

  const proxy = createSidecarProxy({
    serverOrigin: resolved.serverOrigin,
    pageHandler: (req: IncomingMessage, res: ServerResponse) => {
      void app.getRequestHandler()(req, res);
    },
    upgradeHandler: (req: IncomingMessage, socket, head) => {
      void app.getUpgradeHandler()(req, socket, head);
    },
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void proxy.handleRequest(req, res);
  });
  server.on("upgrade", (req: IncomingMessage, socket, head: Buffer) => {
    proxy.handleUpgrade(req, socket, head);
  });

  let boundPort: number;
  try {
    boundPort = await listenOn(server, options.host, options.port);
  } catch (error: unknown) {
    restoreEnv();
    await app.close();
    throw error;
  }

  let closed = false;
  return {
    port: boundPort,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close();
      restoreEnv();
    },
  };
}
