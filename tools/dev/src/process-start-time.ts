import { execFile as nodeExecFile } from "node:child_process";
import { uptime as osUptime } from "node:os";
import { promisify } from "node:util";
import { defaultReadFile } from "./defaults.js";
import { isDefaultPidExists } from "./identity.js";
import type { PidLiveness } from "./identity.js";

/**
OS process start-time reader for the dev orchestrator (ticket 03).

Ticket 02 left this gap: `createPidLivenessChecker` needs a real
start-time lookup so stale recovery verifies identity instead of reusing
PIDs blindly. Children are probed without a shell; any unverifiable PID
resolves null (stale), so callers never signal it.
*/

/**
Tolerance for OS clock granularity (POSIX `ps` reports whole seconds).
*/
export const PROCESS_START_TIME_TOLERANCE_MS = 2000;

/**
Budget for one start-time read. PowerShell cold start under parallel load
regularly exceeded the old 5 s budget, which made live orchestrators read
as stale (round-2 P11c).
*/
const START_TIME_READ_TIMEOUT_MS = 15_000;

/**
Linux `/proc/<pid>/stat` starttime is in USER_HZ clock ticks (100).
*/
const LINUX_CLOCK_TICKS_PER_SECOND = 100;

export interface StartTimeExecDeps {
  platform?: string | undefined;
  execFile?:
    | ((
        command: string,
        args: string[],
        env?: Record<string, string>  
      ) => Promise<{ stdout: string }>)
    | undefined;
  /**
  File reader for the Linux `/proc` fallback.
  */
  readFile?: ((path: string) => Promise<string>) | undefined;
}

const execFileAsync = promisify(nodeExecFile);

async function defaultExecFile(
  command: string,
  args: string[],
  env?: Record<string, string>  
): Promise<{ stdout: string }> {
  // windowsHide: short-lived helper consoles (powershell start-time reads)
  // must never flash a window on every identity check.
  const result = await execFileAsync(command, args, {
    shell: false,
    timeout: START_TIME_READ_TIMEOUT_MS,
    windowsHide: true,
    env: env === undefined ? undefined : { ...process.env, ...env },
  });
  return { stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout) };
}

function isValidPid(pid: number): boolean {
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0;
}

/**
Read one process start time as epoch milliseconds, or null when the PID
is gone, invalid, or otherwise unverifiable. Never throws.
*/
export async function getProcessStartTimeMs(
  pid: number,
  deps?: StartTimeExecDeps  
): Promise<number | null> {
  if (!isValidPid(pid)) return null;
  try {
    const platform = deps?.platform ?? process.platform;
    const execFile = deps?.execFile ?? defaultExecFile;
    const readFile = deps?.readFile ?? defaultReadFile;
    return platform === "win32" ? (await readWindowsStartTimeMs(pid, execFile)) : (await readPosixStartTimeMs(pid, execFile, readFile, platform));
  } catch {
    return null;
  }
}

async function readPosixStartTimeMs(
  pid: number,
  execFile: (
    command: string,
    args: string[],
    env?: Record<string, string>  
  ) => Promise<{ stdout: string }>,
  readFile: (path: string) => Promise<string>,
  platform: string
): Promise<number | null> {
  try {
    // LC_ALL=C pins `ps` lstart to the C locale so Date.parse works under
    // any user locale (round-2 P11c/P12).
    const { stdout } = await execFile("ps", ["-o", "lstart=", "-p", String(pid)], {
      LC_ALL: "C",
      LANG: "C",
    });
    const text = stdout.trim();
    if (text !== "") {
      const parsed = Date.parse(text);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    // `ps` unavailable or denied: fall through to the /proc fallback.
  }
  return readLinuxProcStartTimeMs(pid, platform, readFile);
}

/**
Linux fallback: reconstruct the start time from `/proc/<pid>/stat` field
22 (starttime in clock ticks since boot) and the OS uptime.
*/
async function readLinuxProcStartTimeMs(
  pid: number,
  platform: string,
  readFile: (path: string) => Promise<string>
): Promise<number | null> {
  if (platform !== "linux") return null;
  try {
    const stat = await readFile(`/proc/${String(pid)}/stat`);
    const close = stat.lastIndexOf(")");
    if (close === -1) return null;
    // Fields after the parenthesized name: [0] = state (field 3), so field
    // 22 (starttime) sits at index 19.
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    const startTicks = Number(fields[19]);
    if (!Number.isFinite(startTicks) || startTicks <= 0) return null;
    const elapsedSeconds = osUptime() - startTicks / LINUX_CLOCK_TICKS_PER_SECOND;
    return Date.now() - elapsedSeconds * 1000;
  } catch {
    return null;
  }
}

async function readWindowsStartTimeMs(
  pid: number,
  execFile: (
    command: string,
    args: string[],
    env?: Record<string, string>  
  ) => Promise<{ stdout: string }>
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
Build the identity liveness predicate from real OS state: a PID is live
only when it exists AND its start time is within tolerance of the recorded
value. Unverifiable PIDs count as stale.
*/
export function createOsPidLivenessChecker(deps?: OsLivenessDeps  ): PidLiveness {
  const pidExists = deps?.pidExists ?? isDefaultPidExists;
  return async (pid: number, startTimeMs: number): Promise<boolean> => {
    if (!isValidPid(pid) || !pidExists(pid)) return false;
    const current = await getProcessStartTimeMs(pid, deps);
    return current !== null && Math.abs(current - startTimeMs) <= PROCESS_START_TIME_TOLERANCE_MS;
  };
}

/**
Ownership predicate for namespace acquisition: a PID owns its namespace
while it exists AND either its start time matches the recorded value or
the start time cannot be read at all. Only a verified-dead PID or a
verified start-time mismatch (PID reuse) reads as stale, so an
unverifiable read can never let a successor clobber a possibly-live run
(round-2 P11c). This predicate never authorizes signaling — teardown keeps
using the strict `createOsPidLivenessChecker`.
*/
export function createOsPidOwnershipChecker(deps?: OsLivenessDeps  ): PidLiveness {
  const pidExists = deps?.pidExists ?? isDefaultPidExists;
  return async (pid: number, startTimeMs: number): Promise<boolean> => {
    if (!isValidPid(pid) || !pidExists(pid)) return false;
    const current = await getProcessStartTimeMs(pid, deps);
    return current === null || Math.abs(current - startTimeMs) <= PROCESS_START_TIME_TOLERANCE_MS;
  };
}
