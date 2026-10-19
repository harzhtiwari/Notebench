import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { OrchestratorError } from "./types.js";
import type { ServiceName } from "./types.js";

/**
Child spawning for the dev orchestrator: known executables only, explicit
argument arrays, never a shell wrapper. Each child record carries the
service, PID, namespace, run id, log path, startup timestamp, and exit
observation the supervision layer needs.
*/

/**
Executables the orchestrator may launch. Children run from source through
the local Node executable, so nothing else is ever spawned.
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
  Optional byte sink for child stdout/stderr. The orchestrator attaches
  its per-service log tee here; supervisors that only need exit records
  omit it. Never a shell wrapper: chunks arrive as decoded text.
  */
  onOutput?: ((stream: "stdout" | "stderr", chunk: string) => void) | undefined;
}

export interface ChildExit {
  code: number | null;
  signal: string | null;
  /**
  Set when the child failed before a normal exit was observed (P6).
  */
  error?: string | undefined;
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
Platform gate for supervised-child detachment (research
docs/research/2026-10-15/windows-console-flash.md §2-§4): on Windows,
detached:true is DETACHED_PROCESS (own console), which orphans the whole
subtree into visible popup consoles. POSIX keeps detached:true for
process-group kill; Windows teardown uses taskkill /T instead, and sharing
the console also lets one Ctrl+C reach the whole tree again.
*/
export function isSupervisedDetached(platform: NodeJS.Platform = process.platform): boolean {
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
  const forward = options.output;
  const child: ChildProcess = nodeSpawn(executable, argv, {
    shell: false,
    cwd: options.cwd,
    // The caller-owned env record flows through untouched (keys holding
    // undefined reach Node exactly as provided); the assertion only bridges
    // @types/node's ProcessEnv (which requires NODE_ENV) to that record.
    env: options.env as NodeJS.ProcessEnv | undefined,
    // Pipes are only drained when an output sink is attached; a chatty child
    // with no `onOutput` would otherwise block forever on a full pipe and its
    // `exited` would never resolve (P17).
    stdio: forward === undefined ? "ignore" : "pipe",
    detached: options.detached,
    // Explicitly attached: the whole supervised tree shares the one user
    // console, so third-party grandchildren (Next.js workers, turbo tasks)
    // inherit it instead of flashing fresh windows.
    windowsHide: false,
  });
  // Subscribed immediately: a failed spawn emits 'error' asynchronously and an
  // unhandled 'error' event would crash the orchestrator (P6) — including the
  // no-PID throw path, where `spawnChild` never gets to subscribe.
  const errorListeners: ((error: unknown) => void)[] = [];
  child.on("error", (error: unknown) => {
    for (const listener of errorListeners) listener(error);
  });
  if (forward !== undefined) {
    const stdout = child.stdout;
    if (stdout !== null) {
      // Decode across chunk boundaries so a multi-byte UTF-8 sequence split
      // between chunks is never mangled (P6).
      stdout.setEncoding("utf8");
      stdout.on("data", (chunk: string) => {
        forward("stdout", chunk);
      });
    }
    const stderr = child.stderr;
    if (stderr !== null) {
      stderr.setEncoding("utf8");
      stderr.on("data", (chunk: string) => {
        forward("stderr", chunk);
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
        errorListeners.push((error) => { listener(error); });
      }
    },
  };
}

/**
Spawn one supervised child. The spawner is always invoked with an explicit
argv array and `shell: false`; detached so POSIX group kill can reap the
whole tree at teardown. Throws `OrchestratorError` (exit 1) for unknown
executables, malformed argv, or a child that reports no PID.
*/
export function spawnChild(request: SpawnRequest, deps?: SpawnDeps  ): SpawnedChild {
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
    detached: isSupervisedDetached(),
    output: request.onOutput,
  });
  const pid: number | undefined = child.pid;
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new OrchestratorError(`Spawned ${request.service} reported no PID.`, 1);
  }
  let isSettled = false;
  const { promise: exited, resolve: resolveExit } = Promise.withResolvers<ChildExit>();
  const settle = (value: ChildExit): void => {
    if (isSettled) return;
    isSettled = true;
    resolveExit(value);
  };
  child.on("exit", (...args: unknown[]) => {
    const code: unknown = args[0];
    const signal: unknown = args[1];
    settle({
      code: typeof code === "number" ? code : null,
      signal: typeof signal === "string" ? signal : null,
    });
  });
  // A spawn/process error resolves `exited` with a controlled error record:
  // without this subscription Node's unhandled 'error' event would crash the
  // orchestrator (P6).
  child.on("error", (...args: unknown[]) => {
    const error: unknown = args[0];
    settle({
      code: null,
      signal: null,
      error: error instanceof Error ? error.message : String(error),
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
