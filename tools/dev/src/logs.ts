import { access, appendFile as fsAppendFile, readFile as fsReadFile, rename as fsRename, rm } from "node:fs/promises";
import type { ServiceName } from "./types.js";

/**
 * Per-service prefixed console tee, per-namespace latest/previous rotation,
 * allowlisted startup logging, and failure-tail reads for the dev
 * orchestrator.
 *
 * Vocabulary: orchestrator (foreground owner of logs), namespace
 * (per-session isolation scope), run identity (liveness record).
 */

/** Lines of a failing service log surfaced on child failure (spec 5.13). */
export const LOG_TAIL_LINES = 80;

/**
 * The only startup fields ever written to the console or log files.
 * Everything else (keys, tokens, passwords, full env maps) is dropped by
 * `toSafeStartupRecord`, so secrets can never leak through startup logging.
 */
export const ALLOWLISTED_STARTUP_FIELDS: readonly string[] = [
  "service",
  "namespace",
  "runId",
  "pid",
  "host",
  "serverPort",
  "webPort",
  "warmup",
  "logFile",
  "executable",
];

/** Prefix one console tee line with its service scope. */
export function formatLogLine(service: ServiceName, line: string): string {
  return `[${service}] ${line}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrow an arbitrary startup payload down to the allowlisted string map.
 * Unknown shapes yield an empty record; non-string/number values are dropped.
 */
export function toSafeStartupRecord(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(input)) return out;
  for (const key of ALLOWLISTED_STARTUP_FIELDS) {
    const value: unknown = input[key];
    if (typeof value === "string") {
      if (value !== "") out[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Render one allowlisted startup line for the console tee. Secret-bearing
 * keys are never read, so they can never appear in the output.
 */
export function formatStartupLine(service: ServiceName, input: unknown): string {
  const record = toSafeStartupRecord(input);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    parts.push(`${key}=${value}`);
  }
  if (parts.length === 0) return `[${service}] starting`;
  return `[${service}] starting ${parts.join(" ")}`;
}

export interface ServiceLogTeeOptions {
  logFile: string;
  service: ServiceName;
  logLine: (line: string) => void;
}

export interface ServiceLogTee {
  onOutput: (stream: "stdout" | "stderr", chunk: string) => void;
  flush: () => Promise<void>;
}

/**
 * Per-service log tee shared by the orchestrator's children: every output
 * chunk is appended to the service log file (best-effort, ordered) and
 * complete lines are forwarded to the console tee with the service prefix.
 * Used identically for the server and the web sidecar.
 */
export function createServiceLogTee(options: ServiceLogTeeOptions): ServiceLogTee {
  const { logFile, service, logLine } = options;
  let flushChain: Promise<void> = Promise.resolve();
  const appendOutput = (chunk: string): void => {
    flushChain = flushChain.then(async () => {
      try {
        await fsAppendFile(logFile, chunk);
      } catch {
        // Log writes are best-effort; readiness gating still observes the child.
      }
    });
  };
  let lineBuffer = "";
  const emitPrefixedLines = (chunk: string): void => {
    lineBuffer += chunk;
    const parts = lineBuffer.split("\n");
    lineBuffer = parts.pop() ?? "";
    for (const part of parts) {
      const trimmed = part.replace(/\r$/, "");
      if (trimmed !== "") logLine(formatLogLine(service, trimmed));
    }
  };
  return {
    onOutput: (_stream: "stdout" | "stderr", chunk: string) => {
      appendOutput(chunk);
      emitPrefixedLines(chunk);
    },
    flush: async () => {
      await flushChain;
    },
  };
}

export interface LogReadDeps {
  readFile?: ((path: string) => Promise<string>) | undefined;
}

async function defaultReadFile(path: string): Promise<string> {
  return fsReadFile(path, "utf-8");
}

/**
 * Read the last `maxLines` lines of a service log (default 80) for failure
 * reports. Never throws on trailing-newline shapes; returns short logs whole.
 */
export async function readLogTail(
  logFile: string,
  maxLines: number = LOG_TAIL_LINES,
  deps?: LogReadDeps | undefined
): Promise<string[]> {
  const readFile = deps?.readFile ?? defaultReadFile;
  const content = await readFile(logFile);
  const raw = content.split(/\r?\n/);
  const last: string | undefined = raw[raw.length - 1];
  const lines = last === "" ? raw.slice(0, -1) : raw;
  const count = Math.max(0, Math.floor(maxLines));
  if (lines.length <= count) return lines;
  return lines.slice(lines.length - count);
}

export interface RotateOptions {
  latestFile: string;
  previousFile: string;
}

export interface RotateDeps {
  exists?: ((path: string) => Promise<boolean> | boolean) | undefined;
  rename?: ((from: string, to: string) => Promise<void> | void) | undefined;
  remove?: ((path: string) => Promise<void> | void) | undefined;
}

async function defaultExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultRename(from: string, to: string): Promise<void> {
  await fsRename(from, to);
}

async function defaultRemove(path: string): Promise<void> {
  await rm(path, { force: true });
}

/**
 * Rotate one service log within its own namespace: `latest.log` becomes
 * `previous.log`. Only the two paths given are touched, so a sibling
 * namespace is never affected. Resolves `"fresh"` when there is no latest
 * log yet.
 */
export async function rotateNamespaceLogs(
  options: RotateOptions,
  deps?: RotateDeps | undefined
): Promise<"rotated" | "fresh"> {
  const exists = deps?.exists ?? defaultExists;
  const rename = deps?.rename ?? defaultRename;
  const remove = deps?.remove ?? defaultRemove;
  if (!(await exists(options.latestFile))) return "fresh";
  if (await exists(options.previousFile)) {
    await remove(options.previousFile);
  }
  await rename(options.latestFile, options.previousFile);
  return "rotated";
}
