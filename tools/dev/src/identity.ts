import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defaultReadFile } from "./defaults.js";

/**
 * Run-identity lifecycle for the dev orchestrator (`run/<ns>/identity.json`).
 *
 * A record is live only when every recorded PID still exists AND its process
 * start time matches the recorded value; otherwise the record is stale and
 * must be cleaned up, never signaled. Liveness itself is an injected
 * predicate so unit tests plant stale records deterministically, while the
 * real wiring supplies an OS-backed checker.
 */

export interface ChildIdentity {
  pid: number;
  startTimeMs: number;
}

export interface RunIdentity {
  runId: string;
  namespace: string;
  orchestratorPid: number;
  orchestratorStartTimeMs: number;
  children: Record<string, ChildIdentity>;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChildIdentity(value: unknown): value is ChildIdentity {
  if (!isRecord(value)) return false;
  const pid: unknown = value["pid"];
  const startTimeMs: unknown = value["startTimeMs"];
  return (
    typeof pid === "number" &&
    Number.isInteger(pid) &&
    pid > 0 &&
    typeof startTimeMs === "number" &&
    Number.isFinite(startTimeMs)
  );
}

/** Narrow an unknown payload to a run identity; null for anything else. */
export function parseIdentity(input: unknown): RunIdentity | null {
  if (!isRecord(input)) return null;
  const runId: unknown = input["runId"];
  const namespace: unknown = input["namespace"];
  const orchestratorPid: unknown = input["orchestratorPid"];
  const orchestratorStartTimeMs: unknown = input["orchestratorStartTimeMs"];
  const children: unknown = input["children"];
  const createdAt: unknown = input["createdAt"];
  if (typeof runId !== "string" || runId === "") return null;
  if (typeof namespace !== "string" || namespace === "") return null;
  if (
    typeof orchestratorPid !== "number" ||
    !Number.isInteger(orchestratorPid) ||
    orchestratorPid <= 0
  ) {
    return null;
  }
  if (typeof orchestratorStartTimeMs !== "number" || !Number.isFinite(orchestratorStartTimeMs)) {
    return null;
  }
  if (typeof createdAt !== "string" || createdAt === "") return null;
  if (!isRecord(children)) return null;
  const parsedChildren: Record<string, ChildIdentity> = {};
  for (const [key, value] of Object.entries(children)) {
    if (!isChildIdentity(value)) return null;
    parsedChildren[key] = { pid: value.pid, startTimeMs: value.startTimeMs };
  }
  return {
    runId,
    namespace,
    orchestratorPid,
    orchestratorStartTimeMs,
    children: parsedChildren,
    createdAt,
  };
}

export interface IdentityIoDeps {
  readFile?: ((path: string) => Promise<string>) | undefined;
  writeFile?: ((path: string, content: string) => Promise<void> | void) | undefined;
  mkdir?: ((path: string) => Promise<void> | void) | undefined;
}

async function defaultWriteFile(path: string, content: string): Promise<void> {
  await fsWriteFile(path, content, "utf-8");
}

async function defaultMkdir(path: string): Promise<void> {
  await fsMkdir(path, { recursive: true });
}

/** Persist one run identity record. */
export async function writeIdentity(
  file: string,
  identity: RunIdentity,
  deps?: IdentityIoDeps | undefined
): Promise<void> {
  const writeFile = deps?.writeFile ?? defaultWriteFile;
  const mkdir = deps?.mkdir ?? defaultMkdir;
  await mkdir(dirname(file));
  await writeFile(file, `${JSON.stringify(identity, null, 2)}\n`);
}

/**
 * Load a run identity record. Resolves null for missing files and corrupt
 * payloads instead of throwing, so stale recovery stays total.
 */
export async function readIdentity(
  file: string,
  deps?: IdentityIoDeps | undefined
): Promise<RunIdentity | null> {
  const readFile = deps?.readFile ?? defaultReadFile;
  let content: string;
  try {
    content = await readFile(file);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  return parseIdentity(parsed);
}

/**
 * Liveness predicate: true only when the PID exists AND its process start
 * time matches the recorded value. Sync or async providers both work.
 */
export type PidLiveness = (pid: number, startTimeMs: number) => Promise<boolean> | boolean;

export interface LivenessProvider {
  pidExists: (pid: number) => boolean;
  getStartTimeMs: (pid: number) => number | null;
}

/**
 * Build the liveness predicate from an existence check plus a process
 * start-time lookup. Unverifiable PIDs (unknown start time) count as stale,
 * so callers never signal them.
 */
export function createPidLivenessChecker(provider: LivenessProvider): PidLiveness {
  return (pid: number, startTimeMs: number) => {
    if (!provider.pidExists(pid)) return false;
    const current: number | null = provider.getStartTimeMs(pid);
    if (current === null) return false;
    return current === startTimeMs;
  };
}

/**
 * The record is live only when the orchestrator PID and every child PID
 * verify. Anything else is stale: clean it up, never signal it.
 */
export async function isIdentityLive(
  identity: RunIdentity,
  isPidLive: PidLiveness
): Promise<boolean> {
  if (!(await isPidLive(identity.orchestratorPid, identity.orchestratorStartTimeMs))) {
    return false;
  }
  for (const child of Object.values(identity.children)) {
    if (!(await isPidLive(child.pid, child.startTimeMs))) return false;
  }
  return true;
}

/**
 * Derive this process start time from a clock reading and uptime seconds
 * (`Date.now()` minus `process.uptime() * 1000`), kept pure for tests.
 */
export function currentProcessStartTimeMs(nowMs: number, uptimeSeconds: number): number {
  return nowMs - uptimeSeconds * 1000;
}

/** Best-effort PID existence check via signal zero (EPERM means alive). */
export function defaultPidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (isRecord(error)) {
      const code: unknown = error["code"];
      if (code === "EPERM") return true;
    }
    return false;
  }
}
