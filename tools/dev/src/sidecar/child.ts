import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startSidecar } from "./entry.js";

/**
 * Sidecar child entry for the dev orchestrator (ticket 04).
 *
 * Run from source through the local Node executable with the TypeScript
 * executor loader (mirroring the server child):
 *
 *   node --import tsx/esm tools/dev/src/sidecar/child.ts
 *
 * Contract (mirroring the server's HOST/PORT passthrough plus the
 * orchestrator-owned sidecar env of spec 7.2):
 * - HOST: bind host (default 127.0.0.1).
 * - PORT: bind port (required; the orchestrator reserves it).
 * - NOTEBENCH_SERVER_ORIGIN / NB_SERVER_ORIGIN: live backend origin.
 * - NOTEBENCH_WEB_DIST_DIR / NB_WEB_DIST_DIR: namespaced compiler output.
 * - NOTEBENCH_WEB_DEV_BUNDLER / NB_WEB_DEV_BUNDLER: webpack|turbopack.
 *
 * The web workspace is derived from this module's location, so the child
 * boots from source regardless of its own cwd. Runs until SIGINT/SIGTERM
 * (Ctrl-C on Windows), then closes the compiler and the listener.
 */

function fail(message: string): never {
  console.error(`[web] ${message}`);
  process.exit(1);
}

const root = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
const webDir = join(root, "apps", "web");
const host = process.env["HOST"] ?? "127.0.0.1";
const portRaw = process.env["PORT"];
if (portRaw === undefined || portRaw === "") {
  fail("PORT is required: the orchestrator reserves the web port.");
}
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0) {
  fail(`Invalid PORT "${portRaw as string}": must be a positive integer.`);
}

const handle = await startSidecar({
  webDir,
  host,
  port: port as number,
  env: process.env,
});
console.log(`[web] listening on ${host}:${(handle.port as number)}`);

let stopping = false;
async function stop(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await handle.close();
  } catch (error: unknown) {
    console.error(`[web] error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  process.exit(code);
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));
process.on("uncaughtException", (error: unknown) => {
  console.error(`[web] uncaught: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  void stop(1);
});
process.on("unhandledRejection", (reason: unknown) => {
  console.error(`[web] unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  void stop(1);
});
