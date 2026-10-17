import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink as fsUnlink } from "node:fs/promises";
import { defaultSleep } from "./defaults.js";
import type { RunPaths } from "./paths.js";
import type { ServiceName } from "./types.js";
import { POLL_INTERVAL_MS, TEARDOWN_GRACE_MS } from "./readiness.js";
import type { PidLiveness } from "./identity.js";
import { defaultPidExists } from "./identity.js";

/**
 * Owned-only teardown for the dev orchestrator. Stops children in reverse
 * start order with a bounded graceful wait, force-kills only the owned
 * process tree (`taskkill /T /F` on Windows, process-group kill on POSIX),
 * and deletes only the records of the children it stops: a server in the
 * list removes `server.port`/`server.pid` plus `identity.json` (the run
 * owner), a web child removes `web.port`/`web.pid`. A partial teardown
 * (web only) never removes the server's records or `identity.json`, so a
 * still-live server keeps the records needed for recovery.
 *
 * Stale-record rule: a PID is signaled only after the injected liveness
 * predicate verifies it (existence plus start-time match). Pass an
 * identity-backed checker (see `createPidLivenessChecker`); unverified PIDs
 * are skipped for signaling while their files are still cleaned.
 */

export interface OwnedChild {
  service: ServiceName;
  pid: number;
  startTimeMs: number;
}

export interface ForceKillCommand {
  command: string;
  args: string[];
}

/**
 * Describe the owned-tree force-kill for a PID on a platform: the full-tree
 * `taskkill /T /F` invocation on Windows, process-group SIGKILL on POSIX.
 * Pure (no side effects) so tests assert the exact platform spelling.
 */
export function buildForceKillCommand(
  pid: number,
  platform?: string | undefined
): ForceKillCommand {
  const name = platform ?? process.platform;
  if (name === "win32") {
    return { command: "taskkill", args: ["/T", "/F", "/PID", String(pid)] };
  }
  return { command: "kill", args: ["-KILL", String(0 - pid)] };
}

export interface TeardownDeps {
  platform?: string | undefined;
  isPidLive?: PidLiveness | undefined;
  requestGracefulStop?: ((child: OwnedChild) => Promise<void> | void) | undefined;
  forceKill?: ((pid: number, platform: string) => Promise<void> | void) | undefined;
  unlink?: ((path: string) => Promise<void> | void) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
  graceMs?: number | undefined;
  pollIntervalMs?: number | undefined;
}

export interface TeardownResult {
  stopped: ServiceName[];
  forceKilled: ServiceName[];
  cleanedFiles: string[];
}

const execFileAsync = promisify(nodeExecFile);

function defaultGracefulStop(child: OwnedChild): void {
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    // Already gone: the liveness re-check below observes the reaping.
  }
}

async function defaultForceKill(pid: number, platform: string): Promise<void> {
  try {
    if (platform === "win32") {
      // windowsHide: the force-kill helper must not flash a console window.
      await execFileAsync("taskkill", ["/T", "/F", "/PID", String(pid)], { shell: false, windowsHide: true });
    } else {
      process.kill(0 - pid, "SIGKILL");
    }
  } catch {
    // Already gone: teardown stays idempotent across exit paths.
  }
}

async function defaultUnlink(path: string): Promise<void> {
  try {
    await fsUnlink(path);
  } catch {
    // Missing files are fine: teardown is idempotent.
  }
}

/**
 * Stop every owned child in reverse start order, wait at most `graceMs` for
 * each graceful exit, force-kill the owned tree only when it is still
 * verified live, then remove the records owned by the children it stopped.
 * Idempotent: safe to run on every exit path.
 */
export async function teardownOwnedRun(
  paths: RunPaths,
  childrenInStartOrder: OwnedChild[],
  deps?: TeardownDeps | undefined
): Promise<TeardownResult> {
  const platform = deps?.platform ?? process.platform;
  const wrappedLive: PidLiveness =
    deps?.isPidLive ?? ((pid: number) => defaultPidExists(pid));
  const requestGracefulStop = deps?.requestGracefulStop ?? defaultGracefulStop;
  const forceKill = deps?.forceKill ?? defaultForceKill;
  const unlink = deps?.unlink ?? defaultUnlink;
  const sleep = deps?.sleep ?? defaultSleep;
  const now = deps?.now ?? Date.now;
  const graceMs = deps?.graceMs ?? TEARDOWN_GRACE_MS;
  const pollIntervalMs = deps?.pollIntervalMs ?? POLL_INTERVAL_MS;

  const stopped: ServiceName[] = [];
  const forceKilled: ServiceName[] = [];
  const cleanedFiles: string[] = [];

  const reversed = [...childrenInStartOrder].reverse();
  for (const child of reversed) {
    if (!(await wrappedLive(child.pid, child.startTimeMs))) {
      continue;
    }
    await requestGracefulStop(child);
    stopped.push(child.service);
    const deadline = now() + graceMs;
    let alive = await wrappedLive(child.pid, child.startTimeMs);
    while (alive && now() < deadline) {
      await sleep(pollIntervalMs);
      alive = await wrappedLive(child.pid, child.startTimeMs);
    }
    if (alive) {
      await forceKill(child.pid, platform);
      forceKilled.push(child.service);
    }
  }

  // Record removal follows the children actually torn down: only the
  // server (run owner) owns `identity.json`, and each service owns its own
  // port/PID records. A web-only pass must leave a live server recoverable.
  const ownedFiles: string[] = [];
  const ownedServices = new Set(childrenInStartOrder.map((child) => child.service));
  if (ownedServices.has("server")) {
    ownedFiles.push(paths.serverPortFile, paths.serverPidFile, paths.identityFile);
  }
  if (ownedServices.has("web")) {
    ownedFiles.push(paths.webPortFile, paths.webPidFile);
  }
  for (const file of ownedFiles) {
    try {
      await unlink(file);
      cleanedFiles.push(file);
    } catch {
      // A failing unlink for one file must not block the rest.
    }
  }
  return { stopped, forceKilled, cleanedFiles };
}
