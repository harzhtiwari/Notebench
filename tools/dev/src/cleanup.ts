import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink as fsUnlink } from "node:fs/promises";
import { defaultSleep } from "./defaults.js";
import type { RunPaths } from "./paths.js";
import type { ServiceName } from "./types.js";
import { POLL_INTERVAL_MS, TEARDOWN_GRACE_MS } from "./readiness.js";
import type { PidLiveness } from "./identity.js";
import { defaultPidExists, readIdentity } from "./identity.js";
import { createOsPidLivenessChecker } from "./process-start-time.js";

/**
 * Owned-only teardown for the dev orchestrator. Stops children in reverse
 * start order with a bounded graceful wait, force-kills only the owned
 * process tree (`taskkill /T /F` on Windows, process-group kill on POSIX),
 * and deletes only the records of the services in its teardown list: a
 * server in the list removes `server.port`/`server.pid` plus `identity.json`
 * (the run owner), a web child removes `web.port`/`web.pid`. A partial teardown
 * (web only) never removes the server's records or `identity.json`, so a
 * still-live server keeps the records needed for recovery.
 *
 * Stale-record rule: a PID is signaled only after the injected liveness
 * predicate verifies it (existence plus start-time match). Pass an
 * identity-backed checker (see `createPidLivenessChecker`); unverified PIDs
 * are skipped for signaling and reported via `unverified`. When `runId` is
 * supplied, records are removed only while `identity.json` still carries
 * that run id — a successor run's records are never deleted (P11a).
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
  /**
   * PID-presence check used only to REPORT children that exist but could not
   * be identity-verified; it never authorizes signaling.
   */
  isPidPresent?: ((pid: number) => boolean) | undefined;
  /**
   * Tree/group liveness behind a root that already exited: on POSIX the
   * process group (`kill -pid`) may still have members; Windows descendants
   * are reaped by libuv's job object.
   */
  isTreeLive?: ((pid: number, platform: string) => Promise<boolean> | boolean) | undefined;
  requestGracefulStop?: ((child: OwnedChild) => Promise<void> | void) | undefined;
  forceKill?: ((pid: number, platform: string) => Promise<void> | void) | undefined;
  unlink?: ((path: string) => Promise<void> | void) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
  graceMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  /**
   * When set, record files are removed only while `identity.json` still
   * carries this runId: a successor that already claimed the namespace owns
   * every record and must never lose files to this run's teardown (P11a).
   */
  runId?: string | undefined;
}

export interface TeardownResult {
  stopped: ServiceName[];
  forceKilled: ServiceName[];
  cleanedFiles: string[];
  /**
   * Services whose PID still exists but could not be identity-verified:
   * they were skipped for signaling and are reported instead of silently
   * dropped (P12a).
   */
  unverified: ServiceName[];
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
  } catch (error: unknown) {
    // ENOENT means the file is already gone, which teardown legitimately
    // counts as cleaned; any other failure (EPERM/EACCES/EISDIR) must
    // surface so a caller never reports a file it did not remove.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown })["code"] === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Default tree-liveness check for the force-kill gate. On POSIX a dead root
 * says nothing about its process group: detached-style descendants can
 * outlive it, so probe the group with signal zero (`EPERM` means alive). On
 * Windows the libuv job object reaps the tree with the root, so no extra
 * check applies.
 */
function defaultIsTreeLive(pid: number, platform: string): boolean {
  if (platform === "win32") return false;
  try {
    process.kill(0 - pid, 0);
    return true;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown })["code"] === "EPERM"
    ) {
      return true;
    }
    return false;
  }
}

/**
 * Remove this run's identity claim when the record still carries `runId`.
 * Used on shutdown paths that end before the server child exists; a
 * successor's record is never touched.
 */
export async function releaseRunClaim(
  paths: RunPaths,
  runId: string,
  deps?: Pick<TeardownDeps, "unlink"> | undefined
): Promise<void> {
  const unlink = deps?.unlink ?? defaultUnlink;
  const current = await readIdentity(paths.identityFile);
  if (current !== null && current.runId !== runId) return;
  try {
    await unlink(paths.identityFile);
  } catch {
    // Releasing the claim stays best-effort on shutdown paths: a locked
    // record must not abort teardown; the next run's ownership check handles
    // the residue.
  }
}

/**
 * Stop every owned child in reverse start order, wait at most `graceMs` for
 * each graceful exit, force-kill the owned tree only when it is still
 * verified live, then remove the records owned by the services in the list.
 * Idempotent: safe to run on every exit path.
 */
export async function teardownOwnedRun(
  paths: RunPaths,
  childrenInStartOrder: OwnedChild[],
  deps?: TeardownDeps | undefined
): Promise<TeardownResult> {
  const platform = deps?.platform ?? process.platform;
  // The default liveness check is start-time aware, consistent with the
  // module contract: existence alone never authorizes a signal (P29a).
  const wrappedLive: PidLiveness = deps?.isPidLive ?? createOsPidLivenessChecker();
  const isPidPresent = deps?.isPidPresent ?? defaultPidExists;
  const isTreeLive = deps?.isTreeLive ?? defaultIsTreeLive;
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
  const unverified: ServiceName[] = [];

  const reversed = [...childrenInStartOrder].reverse();
  for (const child of reversed) {
    try {
      if (!(await wrappedLive(child.pid, child.startTimeMs))) {
        // Presence without verification is reported, never signaled (P12a).
        if (isPidPresent(child.pid)) unverified.push(child.service);
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
      if (!alive && (await isTreeLive(child.pid, platform))) {
        // The root exited during grace but its process group/tree still has
        // members: the force-kill must still run (P12b).
        alive = true;
      }
      if (alive) {
        await forceKill(child.pid, platform);
        forceKilled.push(child.service);
      }
    } catch {
      // Fault containment (P29b): a rejecting liveness/stop dependency must
      // not abort later children or skip the record removal below.
    }
  }

  // Record removal covers exactly the services in the teardown list: only
  // the server (run owner) owns `identity.json`, and each service owns its
  // own port/PID records. A web-only pass must leave a live server
  // recoverable.
  const ownedFiles: string[] = [];
  const ownedServices = new Set(childrenInStartOrder.map((child) => child.service));
  if (ownedServices.has("server")) {
    ownedFiles.push(paths.serverPortFile, paths.serverPidFile, paths.identityFile);
  }
  if (ownedServices.has("web")) {
    ownedFiles.push(paths.webPortFile, paths.webPidFile);
  }
  let recordsStillOwned = true;
  if (deps?.runId !== undefined) {
    const current = await readIdentity(paths.identityFile);
    recordsStillOwned = current === null || current.runId === deps.runId;
  }
  if (recordsStillOwned) {
    for (const file of ownedFiles) {
      try {
        await unlink(file);
        cleanedFiles.push(file);
      } catch {
        // A failing unlink for one file must not block the rest.
      }
    }
  }
  return { stopped, forceKilled, cleanedFiles, unverified };
}
