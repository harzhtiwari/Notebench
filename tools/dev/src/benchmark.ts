import { createHash } from "node:crypto";
import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rm as fsRm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBackendPhase, startDefaultWebPhase } from "./composer.js";
import type { ServerReadyContext } from "./composer.js";
import { resolveRunPaths } from "./paths.js";
import { OrchestratorError } from "./types.js";
import type { WarmupGateName, WarmupResult } from "./warmup.js";

/**
 * Cold/warm startup benchmark for the dev orchestrator (ticket 08, spec §8).
 *
 * Method: N sequential runs each of cold (empty `.tmp/build/<ns>`) and warm
 * (reused compiler cache) on the same machine and lockfile; report median
 * and p95 per metric. Metrics: time to server health, time to route-ready,
 * time to ui-ready (with `--warmup ui`), and wall-clock total per run.
 * Preparation/listener phases are not separately instrumented: their sum is
 * `totalMs - healthMs - routeMs` at route level.
 *
 * Usage: `pnpm exec tsx tools/dev/src/benchmark.ts [--runs 5]
 *   [--namespace bench] [--warmup route|ui]`
 */

interface RunTrace {
  mode: "cold" | "warm";
  run: number;
  healthMs: number;
  healthAttempts: number;
  routeMs: number | null;
  routeAttempts: number | null;
  uiMs: number | null;
  totalMs: number;
}

interface BenchmarkReport {
  tool: "tools/dev/src/benchmark.ts";
  warmup: "route" | "ui";
  runsPerMode: number;
  machine: { platform: string; node: string; cpus: number };
  lockfileSha256: string | null;
  runs: RunTrace[];
  summary: Record<string, { median: number | null; p95: number | null }>;
}

export interface ParsedBenchmarkArgs {
  runsPerMode: number;
  namespace: string;
  warmup: "route" | "ui";
}

/**
 * Parse benchmark flags from an argv array (without the node/script prefix).
 * Accepts both `--flag=value` and `--flag value` forms; unknown warmup values
 * throw so a typo never silently benchmarks the wrong level.
 */
export function parseBenchmarkArgs(argv: string[]): ParsedBenchmarkArgs {
  const get = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    for (let i = 0; i < argv.length; i += 1) {
      const arg: string | undefined = argv[i];
      if (arg === undefined) continue;
      if (arg.startsWith(prefix)) {
        const value = arg.slice(prefix.length);
        if (value !== "") return value;
      } else if (arg === `--${name}`) {
        const next: string | undefined = argv[i + 1];
        if (next !== undefined && next !== "" && next.startsWith("--") === false) return next;
      }
    }
    return fallback;
  };
  const parsedRuns = Number.parseInt(get("runs", "5"), 10);
  const runsPerMode = Number.isNaN(parsedRuns) ? 5 : Math.max(1, parsedRuns);
  const namespace = get("namespace", "bench");
  const warmupFlag = get("warmup", "route");
  if (warmupFlag !== "route" && warmupFlag !== "ui") {
    throw new OrchestratorError(
      `Unknown --warmup "${warmupFlag}": expected "route" or "ui".`,
      1
    );
  }
  return { runsPerMode, namespace, warmup: warmupFlag };
}

function sortedValues(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = sortedValues(values);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return (((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = sortedValues(values);
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[index] as number;
}

export function summarizeBenchmarkRuns(
  runs: RunTrace[],
  mode: "cold" | "warm"
): BenchmarkReport["summary"] {
  const subset = runs.filter((r) => r.mode === mode);
  const pick = (fn: (r: RunTrace) => number | null): number[] =>
    subset.map(fn).filter((v): v is number => v !== null);
  const health = pick((r) => r.healthMs);
  const route = pick((r) => r.routeMs);
  const ui = pick((r) => r.uiMs);
  const total = pick((r) => r.totalMs);
  return {
    [`${mode}.healthMs`]: { median: median(health), p95: p95(health) },
    [`${mode}.routeMs`]: { median: median(route), p95: p95(route) },
    [`${mode}.uiMs`]: { median: median(ui), p95: p95(ui) },
    [`${mode}.totalMs`]: { median: median(total), p95: p95(total) },
  };
}

function summarize(runs: RunTrace[], mode: "cold" | "warm"): BenchmarkReport["summary"] {
  return summarizeBenchmarkRuns(runs, mode);
}

async function lockfileHash(root: string): Promise<string | null> {
  try {
    const content = await fsReadFile(join(root, "pnpm-lock.yaml"), "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

function timingNamed(result: WarmupResult, name: WarmupGateName): { elapsedMs: number; attempts: number } | null {
  const found = result.timings.find((t) => t.name === name);
  return found === undefined ? null : { elapsedMs: found.elapsedMs, attempts: found.attempts };
}

async function runOnce(
  root: string,
  namespace: string,
  warmup: "route" | "ui",
  mode: "cold" | "warm",
  run: number
): Promise<RunTrace> {
  const paths = resolveRunPaths(root, namespace);
  if (mode === "cold") {
    await fsRm(paths.buildDir, { recursive: true, force: true });
  }
  let healthMs = 0;
  let healthAttempts = 0;
  let warmupResult: WarmupResult | null = null;
  const wallStart = Date.now();
  const handle = await startBackendPhase(
    { root, argv: ["--namespace", namespace, "--warmup", warmup], env: process.env },
    {
      startWebPhase: (ctx: ServerReadyContext) => startDefaultWebPhase(ctx, undefined, process.env),
      onServerReady: (ctx: ServerReadyContext) => {
        healthMs = ctx.timings.healthElapsedMs;
        healthAttempts = ctx.timings.healthAttempts;
      },
      onWarmup: (result: WarmupResult) => {
        warmupResult = result;
      },
      logLine: (line: string) => {
        console.log(`[bench:${mode}:${run}] ${line}`);
      },
    }
  );
  try {
    const route = warmupResult === null ? null : timingNamed(warmupResult, "route-ready");
    const ui = warmupResult === null ? null : timingNamed(warmupResult, "ui-ready");
    return {
      mode,
      run,
      healthMs,
      healthAttempts,
      routeMs: route?.elapsedMs ?? null,
      routeAttempts: route?.attempts ?? null,
      uiMs: ui?.elapsedMs ?? null,
      totalMs: Date.now() - wallStart,
    };
  } finally {
    await handle.shutdown();
  }
}

async function main(): Promise<number> {
  let args: ParsedBenchmarkArgs;
  try {
    args = parseBenchmarkArgs(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const { runsPerMode, namespace, warmup } = args;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = dirname(dirname(dirname(here)));
  const runs: RunTrace[] = [];
  for (let run = 1; run <= runsPerMode; run += 1) {
    runs.push(await runOnce(root, namespace, warmup, "cold", run));
  }
  for (let run = 1; run <= runsPerMode; run += 1) {
    runs.push(await runOnce(root, namespace, warmup, "warm", run));
  }
  const summary = { ...summarize(runs, "cold"), ...summarize(runs, "warm") };
  const report: BenchmarkReport = {
    tool: "tools/dev/src/benchmark.ts",
    warmup,
    runsPerMode,
    machine: { platform: process.platform, node: process.version, cpus: cpus().length },
    lockfileSha256: await lockfileHash(root),
    runs,
    summary,
  };
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\..+$/, "");
  const dir = join(root, ".scratch", "dev-runtime-mirror", "benchmarks");
  await fsMkdir(dir, { recursive: true });
  const base = join(dir, `${stamp}-${warmup}`);
  await fsWriteFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  const lines = [
    `# Benchmark ${stamp} (warmup=${warmup}, runs=${runsPerMode})`,
    "",
    `- machine: ${report.machine.platform} ${report.machine.node} (${report.machine.cpus} cpus)`,
    `- lockfile sha256: ${report.lockfileSha256 ?? "(missing)"}`,
    "",
    "| metric | median | p95 |",
    "|---|---|---|",
  ];
  for (const [metric, stats] of Object.entries(summary)) {
    lines.push(`| ${metric} | ${stats.median ?? "-"} | ${stats.p95 ?? "-"} |`);
  }
  lines.push("", "## runs", "");
  for (const r of runs) {
    lines.push(
      `- ${r.mode} #${r.run}: healthMs=${r.healthMs} routeMs=${r.routeMs ?? "-"} uiMs=${r.uiMs ?? "-"} totalMs=${r.totalMs}`
    );
  }
  lines.push("");
  await fsWriteFile(`${base}.md`, `${lines.join("\n")}\n`, "utf-8");
  console.log(`Benchmark complete: ${base}.json`);
  return 0;
}

const invokedAsScript = (() => {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  const modulePath = fileURLToPath(import.meta.url);
  return invoked === modulePath || resolve(invoked) === modulePath;
})();

if (invokedAsScript) {
  const code = await main();
  process.exitCode = code;
}
