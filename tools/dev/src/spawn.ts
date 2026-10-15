import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { OrchestratorError } from "./types.js";
import type { ServiceName } from "./types.js";

/**
 * Child spawning for the dev orchestrator: known executables only, explicit
 * argument arrays, never a shell wrapper. Each child record carries the
 * service, PID, namespace, run id, log path, startup timestamp, and exit
 * observation the supervision layer needs.
 */

/**
 * Executables the orchestrator may launch. Children run from source through
 * the local Node executable, so nothing else is ever spawned.
 */
export const KNOWN_EXECUTABLES: readonly string[] = [process.execPath, "node"];

export interface SpawnRequest {
  executable: string;
  argv: string[];
  service: ServiceName;
  namespace: string;
  runId: string;
  logFile: string;
  cwd?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  /**
   * Optional byte sink for child stdout/stderr. The orchestrator attaches
   * its per-service log tee here; supervisors that only need exit records
   * omit it. Never a shell wrapper: chunks arrive as decoded text.
   */
  onOutput?: ((stream: "stdout" | "stderr", chunk: string) => void) | undefined;
}

export interface ChildExit {
  code: number | null;
  signal: string | null;
}

export interface SpawnedChild {
  pid: number;
  startTimeMs: number;
  service: ServiceName;
  namespace: string;
  runId: string;
  logFile: string;
  executable: string;
  argv: string[];
  exited: Promise<ChildExit>;
}

export interface SpawnFnOptions {
  shell: false;
  cwd?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  stdio?: string | undefined;
  detached?: boolean | undefined;
  output?: ((stream: "stdout" | "stderr", chunk: string) => void) | undefined;
}

export interface SpawnFnChild {
  pid?: number | undefined;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

export type SpawnFn = (
  executable: string,
  argv: string[],
  options: SpawnFnOptions
) => SpawnFnChild;

/**
 * Platform gate for supervised-child detachment (research
 * docs/research/2026-10-15/windows-console-flash.md §2-§4): on Windows,
 * detached:true is DETACHED_PROCESS (own console), which orphans the whole
 * subtree into visible popup consoles. POSIX keeps detached:true for
 * process-group kill; Windows teardown uses taskkill /T instead, and sharing
 * the console also lets one Ctrl+C reach the whole tree again.
 */
export function supervisedDetached(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}

export interface SpawnDeps {
  spawnFn?: SpawnFn | undefined;
  now?: (() => number) | undefined;
}

function isKnownExecutable(executable: string): boolean {
  for (const known of KNOWN_EXECUTABLES) {
    if (executable === known) return true;
  }
  return false;
}

function defaultSpawnFn(
  executable: string,
  argv: string[],
  options: SpawnFnOptions
): SpawnFnChild {
  const child: ChildProcess = nodeSpawn(executable, argv, {
    shell: false,
    cwd: options.cwd,
    // The caller-owned env record flows through untouched (keys holding
    // undefined reach Node exactly as provided); the assertion only bridges
    // @types/node's ProcessEnv (which requires NODE_ENV) to that record.
    env: options.env as NodeJS.ProcessEnv | undefined,
    stdio: "pipe",
    detached: options.detached,
    // Explicitly attached: the whole supervised tree shares the one user
    // console, so third-party grandchildren (Next.js workers, turbo tasks)
    // inherit it instead of flashing fresh windows.
    windowsHide: false,
  });
  const forward = options.output;
  if (forward !== undefined) {
    const stdout = child.stdout;
    if (stdout !== null) {
      stdout.on("data", (chunk: unknown) => {
        forward("stdout", typeof chunk === "string" ? chunk : String(chunk));
      });
    }
    const stderr = child.stderr;
    if (stderr !== null) {
      stderr.on("data", (chunk: unknown) => {
        forward("stderr", typeof chunk === "string" ? chunk : String(chunk));
      });
    }
  }
  return {
    pid: child.pid,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === "exit") {
        child.on("exit", (code: number | null, signal: unknown) => {
          listener(code, typeof signal === "string" ? signal : null);
        });
      } else if (event === "error") {
        child.on("error", (error: unknown) => {
          listener(error);
        });
      }
    },
  };
}

/**
 * Spawn one supervised child. The spawner is always invoked with an explicit
 * argv array and `shell: false`; detached so POSIX group kill can reap the
 * whole tree at teardown. Throws `OrchestratorError` (exit 1) for unknown
 * executables, malformed argv, or a child that reports no PID.
 */
export function spawnChild(request: SpawnRequest, deps?: SpawnDeps | undefined): SpawnedChild {
  if (!isKnownExecutable(request.executable)) {
    throw new OrchestratorError(
      `Refusing to spawn unknown executable "${request.executable}" for ${request.service}: ` +
        `expected one of ${KNOWN_EXECUTABLES.join(", ")}.`,
      1
    );
  }
  if (!Array.isArray(request.argv)) {
    throw new OrchestratorError(
      `Invalid argv for ${request.service}: expected an explicit argument array.`,
      1
    );
  }
  for (const arg of request.argv) {
    if (typeof arg !== "string") {
      throw new OrchestratorError(
        `Invalid argv entry for ${request.service}: every argument must be a string.`,
        1
      );
    }
  }
  const spawnFn = deps?.spawnFn ?? defaultSpawnFn;
  const now = deps?.now ?? Date.now;
  const startTimeMs = now();
  const child = spawnFn(request.executable, [...request.argv], {
    shell: false,
    cwd: request.cwd,
    env: request.env,
    stdio: "pipe",
    detached: supervisedDetached(),
    output: request.onOutput,
  });
  const pid: number | undefined = child.pid;
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
    throw new OrchestratorError(`Spawned ${request.service} reported no PID.`, 1);
  }
  let resolveExit: (value: ChildExit) => void = () => undefined;
  const exited = new Promise<ChildExit>((resolve) => {
    resolveExit = resolve;
  });
  child.on("exit", (...args: unknown[]) => {
    const code: unknown = args[0];
    const signal: unknown = args[1];
    resolveExit({
      code: typeof code === "number" ? code : null,
      signal: typeof signal === "string" ? signal : null,
    });
  });
  return {
    pid,
    startTimeMs,
    service: request.service,
    namespace: request.namespace,
    runId: request.runId,
    logFile: request.logFile,
    executable: request.executable,
    argv: [...request.argv],
    exited,
  };
}
