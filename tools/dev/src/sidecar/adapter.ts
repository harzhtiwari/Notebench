import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { OrchestratorError } from "../types.js";

/**
 * Next.js interop isolate for the dev web sidecar (ticket 04, spec 5.8).
 *
 * The pinned Next version's server factory is loaded dynamically, anchored
 * at the web workspace — the orchestrator root never imports `next`
 * statically (it is not a root dependency). Everything third-party crosses
 * this one seam as `unknown` and is narrowed to the structural
 * {@link CompilerApp} before use.
 *
 * Pinned API (Next 16.4.0, shipped `dist/server/next.d.ts` + the
 * `dist/docs` custom-server guide): default-export factory
 * `next({ dev, dir, hostname, port, webpack | turbopack })` returning
 * `{ prepare(), getRequestHandler(), getUpgradeHandler(), close() }`.
 *
 * Two controls reach the dev server through the factory (shipped
 * `dist/server/next.js` `createServer` bridges them onto the environment
 * before the compiler boots): `webpack: true` selects the webpack compiler,
 * `turbopack: true` the opt-in experiment; with neither, Next defaults to
 * Turbopack (`TURBOPACK='auto'`). The factory's `conf` option, by contrast,
 * is silently dropped on the custom-server path (the dev server reads the
 * file config instead): `distDir` is driven by the
 * `NOTEBENCH_WEB_DIST_DIR` branch in `apps/web/next.config.ts`, so passing
 * `conf` here would lie about control and it stays out.
 */

/** Installed Next.js version this sidecar is pinned against. */
const PINNED_NEXT_VERSION = "16.4.0";

export type DevBundler = "webpack" | "turbopack";

export interface CompilerAppOptions {
  webDir: string;
  hostname: string;
  port: number;
  bundler: DevBundler;
}

interface CompilerRequestHandler {
  (req: IncomingMessage, res: ServerResponse): Promise<void> | void;
}

interface CompilerUpgradeHandler {
  (req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> | void;
}

export interface CompilerApp {
  prepare: () => Promise<void>;
  getRequestHandler: () => CompilerRequestHandler;
  getUpgradeHandler: () => CompilerUpgradeHandler;
  close: () => Promise<void>;
}

export interface CompilerLoader {
  loadFactory: (webDir: string) => Promise<unknown>;
  readPinnedVersion: (webDir: string) => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

async function defaultLoadFactory(webDir: string): Promise<unknown> {
  const require = createRequire(join(webDir, "package.json"));
  const target: string = require.resolve("next");
  return import(pathToFileURL(target).href);
}

function defaultReadPinnedVersion(webDir: string): string {
  const require = createRequire(join(webDir, "package.json"));
  const packagePath: string = require.resolve("next/package.json");
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf-8"));
  if (!isRecord(parsed) || typeof parsed["version"] !== "string") {
    throw new OrchestratorError(
      `Cannot read the installed Next.js version from "${packagePath}".`,
      1
    );
  }
  return parsed["version"];
}

function narrowCompilerApp(candidate: unknown): CompilerApp {
  if (!isRecord(candidate)) {
    throw new OrchestratorError("Unexpected Next.js server shape: not an object.", 1);
  }
  const prepare = candidate["prepare"];
  const getRequestHandler = candidate["getRequestHandler"];
  const getUpgradeHandler = candidate["getUpgradeHandler"];
  const close = candidate["close"];
  if (
    !isCallable(prepare) ||
    !isCallable(getRequestHandler) ||
    !isCallable(getUpgradeHandler) ||
    !isCallable(close)
  ) {
    throw new OrchestratorError(
      "Unexpected Next.js server shape: missing prepare/getRequestHandler/getUpgradeHandler/close.",
      1
    );
  }
  // The factory product is receiver-bound: every method runs with the
  // server object as `this` (detached calls fail on `this.options`).
  return {
    prepare: () => Promise.resolve(Reflect.apply(prepare, candidate, [])).then(() => undefined),
    getRequestHandler: () => {
      const handler = Reflect.apply(getRequestHandler, candidate, []);
      if (!isCallable(handler)) {
        throw new OrchestratorError("Unexpected Next.js request handler shape.", 1);
      }
      return (req: IncomingMessage, res: ServerResponse) => {
        const result = Reflect.apply(handler, undefined, [req, res]);
        return Promise.resolve(result).then(() => undefined);
      };
    },
    getUpgradeHandler: () => {
      const handler = Reflect.apply(getUpgradeHandler, candidate, []);
      if (!isCallable(handler)) {
        throw new OrchestratorError("Unexpected Next.js upgrade handler shape.", 1);
      }
      return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const result = Reflect.apply(handler, undefined, [req, socket, head]);
        return Promise.resolve(result).then(() => undefined);
      };
    },
    close: () => Promise.resolve(Reflect.apply(close, candidate, [])).then(() => undefined),
  };
}

export async function createCompilerApp(
  options: CompilerAppOptions,
  deps?: CompilerLoader | undefined
): Promise<CompilerApp> {
  const loadFactory = deps?.loadFactory ?? defaultLoadFactory;
  const readPinnedVersion = deps?.readPinnedVersion ?? defaultReadPinnedVersion;

  const installed = readPinnedVersion(options.webDir);
  if (installed !== PINNED_NEXT_VERSION) {
    throw new OrchestratorError(
      `Installed Next.js ${installed} does not match the pinned ${PINNED_NEXT_VERSION}: ` +
        `re-pin the programmatic server API before running the sidecar.`,
      1
    );
  }

  const loaded = await loadFactory(options.webDir);
  if (!isRecord(loaded) || !isCallable(loaded["default"])) {
    throw new OrchestratorError("Unexpected Next.js module shape: missing default factory.", 1);
  }
  const factory = loaded["default"];

  const app = factory({
    dev: true,
    dir: options.webDir,
    hostname: options.hostname,
    port: options.port,
    ...(options.bundler === "turbopack" ? { turbopack: true } : { webpack: true }),
  });
  return narrowCompilerApp(app);
}
