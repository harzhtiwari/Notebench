import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultPidExists } from "./identity.js";
import type { PidLiveness } from "./identity.js";

/**
 * OS process start-time reader for the dev orchestrator (ticket 03).
 *
 * Ticket 02 left this gap: `createPidLivenessChecker` needs a real
 * start-time lookup so stale recovery verifies identity instead of reusing
 * PIDs blindly. Children are probed without a shell; any unverifiable PID
 * resolves null (stale), so callers never signal it.
 */

/** Tolerance for OS clock granularity (POSIX `ps` reports whole seconds). */
export const PROCESS_START_TIME_TOLERANCE_MS = 2000;

export interface StartTimeExecDeps {
  platform?: string | undefined;
  execFile?:
    | ((command: string, args: string[]) => Promise<{ stdout: string }>)
    | undefined;
}

const execFileAsync = promisify(nodeExecFile);

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string }> {
  // windowsHide: short-lived helper consoles (powershell start-time reads)
  // must never flash a window on every identity check.
  const result = await execFileAsync(command, args, { shell: false, timeout: 5000, windowsHide: true });
  return { stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout) };
}

function isValidPid(pid: number): boolean {
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0;
}

/**
 * Read one process start time as epoch milliseconds, or null when the PID
 * is gone, invalid, or otherwise unverifiable. Never throws.
 */
export async function getProcessStartTimeMs(
  pid: number,
  deps?: StartTimeExecDeps | undefined
): Promise<number | null> {
  if (!isValidPid(pid)) return null;
  try {
    const platform = deps?.platform ?? process.platform;
    const execFile = deps?.execFile ?? defaultExecFile;
    if (platform === "win32") {
      return await readWindowsStartTimeMs(pid, execFile);
    }
    return await readPosixStartTimeMs(pid, execFile);
  } catch {
    return null;
  }
}

async function readPosixStartTimeMs(
  pid: number,
  execFile: (command: string, args: string[]) => Promise<{ stdout: string }>
): Promise<number | null> {
  const { stdout } = await execFile("ps", ["-o", "lstart=", "-p", String(pid)]);
  const text = stdout.trim();
  if (text === "") return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readWindowsStartTimeMs(
  pid: number,
  execFile: (command: string, args: string[]) => Promise<{ stdout: string }>
): Promise<number | null> {
  const script = `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o')`;
  const { stdout } = await execFile("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
  const text = stdout.trim();
  if (text === "") return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface OsLivenessDeps extends StartTimeExecDeps {
  pidExists?: ((pid: number) => boolean) | undefined;
}

/**
 * Build the identity liveness predicate from real OS state: a PID is live
 * only when it exists AND its start time is within tolerance of the recorded
 * value. Unverifiable PIDs count as stale.
 */
export function createOsPidLivenessChecker(deps?: OsLivenessDeps | undefined): PidLiveness {
  const pidExists = deps?.pidExists ?? defaultPidExists;
  return async (pid: number, startTimeMs: number): Promise<boolean> => {
    if (!isValidPid(pid)) return false;
    if (!pidExists(pid)) return false;
    const current = await getProcessStartTimeMs(pid, deps);
    if (current === null) return false;
    return Math.abs(current - startTimeMs) <= PROCESS_START_TIME_TOLERANCE_MS;
  };
}
