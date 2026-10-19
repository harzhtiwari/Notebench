import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  benchmarkFailureExitCode,
  parseBenchmarkArgs,
  runBenchmarkBatches,
  runOnce,
  summarizeBenchmarkRuns,
} from "../src/benchmark.js";
import type { SpawnFn } from "../src/spawn.js";
import { resolveRunPaths } from "../src/paths.js";
import { OrchestratorError } from "../src/types.js";
import { makeTempRoot, removeTempRoots } from "./temp-dir.js";
/**
Ticket 08 RED suite: the benchmark harness must accept both `--flag=value`
and `--flag value` forms (the documented usage shows the space form), so a
`--warmup ui` invocation never silently benchmarks route mode.
*/

describe("ticket 08: benchmark flag parsing", () => {
  it("accepts equals-form flags", () => {
    expect(parseBenchmarkArgs(["--runs=5", "--namespace=bench", "--warmup=route"])).toEqual({
      runsPerMode: 5,
      namespace: "bench",
      warmup: "route",
    });
  });

  it("accepts space-form flags (documented usage)", () => {
    expect(parseBenchmarkArgs(["--runs", "5", "--namespace", "bench", "--warmup", "ui"])).toEqual({
      runsPerMode: 5,
      namespace: "bench",
      warmup: "ui",
    });
  });

  it("space-form --warmup ui selects the ui benchmark, never silent route", () => {
    expect(parseBenchmarkArgs(["--warmup", "ui"]).warmup).toBe("ui");
  });

  it("falls back to documented defaults with no flags", () => {
    expect(parseBenchmarkArgs([])).toEqual({ runsPerMode: 5, namespace: "bench", warmup: "route" });
  });
});

describe("ticket 08: benchmark flag strictness (P27)", () => {
  it("rejects unknown flags instead of silently benchmarking another mode", () => {
    let caught: unknown = null;
    try {
      parseBenchmarkArgs(["--warmup-ui"]);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrchestratorError);
    expect((caught as OrchestratorError).exitCode).toBe(1);
    expect((caught as Error).message).toContain('Unknown flag "--warmup-ui"');
  });

  it("rejects stray positional arguments", () => {
    let caught: unknown = null;
    try {
      parseBenchmarkArgs(["--runs", "2", "bench"]);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrchestratorError);
    expect((caught as Error).message).toContain('Unexpected argument "bench"');
  });

  it("rejects a flag whose value is missing", () => {
    let caught: unknown = null;
    try {
      parseBenchmarkArgs(["--runs"]);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrchestratorError);
    expect((caught as Error).message).toContain('Flag "--runs" requires a value.');
  });
});

describe("ticket 08: benchmark summary statistics", () => {
  it("reports median and p95 per metric and mode", () => {
    const summary = summarizeBenchmarkRuns(
      [
        { mode: "cold", run: 1, healthMs: 100, healthAttempts: 2, routeMs: 50, routeAttempts: 1, uiMs: null, totalMs: 200 },
        { mode: "cold", run: 2, healthMs: 300, healthAttempts: 4, routeMs: 150, routeAttempts: 2, uiMs: null, totalMs: 600 },
      ],
      "cold"
    );
    expect(summary["cold.healthMs"]).toEqual({ median: 200, p95: 300 });
    expect(summary["cold.routeMs"]).toEqual({ median: 100, p95: 150 });
  });
});

describe("ticket 08: benchmark failure containment (P27)", () => {
  it("stops at the first failed run and keeps the completed traces", async () => {
    const failure = new OrchestratorError("web readiness timed out", 4);
    const calls: string[] = [];
    const result = await runBenchmarkBatches(2, async (mode, run) => {
      calls.push(`${mode}:${run}`);
      if (mode === "cold" && run === 2) throw failure;
      return {
        mode,
        run,
        healthMs: 100,
        healthAttempts: 1,
        routeMs: null,
        routeAttempts: null,
        uiMs: null,
        totalMs: 200,
      };
    });
    expect(calls).toEqual(["cold:1", "cold:2"]);
    expect(result.runs.map((trace) => `${trace.mode}:${trace.run}`)).toEqual(["cold:1"]);
    expect(result.failure).toBe(failure);
  });

  it("maps an OrchestratorError to its exit code and anything else to 1", () => {
    expect(benchmarkFailureExitCode(new OrchestratorError("sidecar timeout", 4))).toBe(4);
    expect(benchmarkFailureExitCode(new Error("boom"))).toBe(1);
    expect(benchmarkFailureExitCode("boom")).toBe(1);
  });
});

describe("ticket 08: benchmark run wiring", () => {
  it("keeps the bench run tag on every captured web startup line", async () => {
    const roots: string[] = [];
    const root = makeTempRoot(roots, "bench-wire-");
    const captured: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    });
    const exitListeners: ((...args: unknown[]) => void)[] = [];
    const spawnFn: SpawnFn = () => ({
      pid: 99_999,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "exit") exitListeners.push(listener);
      },
    });
    let isReaped = false;
    try {
      await runOnce(root, "bench-wire", "route", "cold", 7, {
        backend: {
          runBuild: () => {},
          spawnFn,
          // Fake children never exit on their own. Shutdown's first liveness
          // check happens inside its teardown (the run is already closing),
          // so resolving the captured exits there lets shutdown return
          // without sitting out the reap grace — and the false verdict
          // guarantees pid 99999 is never signaled.
          isPidLive: () => {
            if (!isReaped) {
              isReaped = true;
              for (const listener of exitListeners) listener(0, null);
            }
            return false;
          },
          probeHealth: async () => true,
          probeWeb: async () => true,
          pollIntervalMs: 20,
          webDeadlineMs: 2000,
        },
      });

      const tag = "[bench:cold:7] ";
      const webStartup = captured.filter((line) => line.includes("[web] starting"));
      expect(webStartup.length).toBeGreaterThan(0);
      expect(webStartup.filter((line) => !line.startsWith(tag))).toEqual([]);

      const devReady = captured.filter((line) => line.includes("[dev] ready"));
      expect(devReady.some((line) => line.startsWith(tag))).toBe(true);
    } finally {
      logSpy.mockRestore();
      await removeTempRoots(roots);
    }
  }, 30_000);
});

describe("ticket 08: cold reset runs after the namespace claim (P15)", () => {
  it("passes the cold reset as the backend prep hook instead of rm-ing before startBackendPhase", async () => {
    const roots: string[] = [];
    const root = makeTempRoot(roots, "bench-prep-");
    const paths = resolveRunPaths(root, "prep-bench");
    mkdirSync(paths.buildDir, { recursive: true });
    const sentinel = path.join(paths.buildDir, "sentinel.txt");
    writeFileSync(sentinel, "live", "utf8");
    let isDirPresentAtPhaseEntry = false;
    let isDirPresentAfterPrep = true;
    vi.resetModules();
    vi.doMock("../src/composer.js", () => ({
      startBackendPhase: async (
        options: { root?: string | undefined } | undefined,
        deps: { prep?: (() => Promise<void> | void) | undefined } | undefined
      ) => {
        // The phase is entered first; only then does the prep hook run (the
        // real phase invokes it after the exclusive namespace claim).
        const phasePaths = resolveRunPaths(options?.root ?? process.cwd(), "prep-bench");
        isDirPresentAtPhaseEntry = existsSync(path.join(phasePaths.buildDir, "sentinel.txt"));
        await deps?.prep?.();
        isDirPresentAfterPrep = existsSync(path.join(phasePaths.buildDir, "sentinel.txt"));
        return { shutdown: async () => 0 };
      },
      startDefaultWebPhase: async () => {
        throw new Error("the web phase is not expected in this test");
      },
    }));
    try {
      const bench = await import("../src/benchmark.js");
      const trace = await bench.runOnce(root, "prep-bench", "route", "cold", 1);
      expect(trace.mode).toBe("cold");
      // The build dir was untouched when the phase began (a busy namespace
      // still owns it) and the cold reset ran inside the prep hook.
      expect(isDirPresentAtPhaseEntry).toBe(true);
      expect(isDirPresentAfterPrep).toBe(false);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      vi.doUnmock("../src/composer.js");
      vi.resetModules();
      await removeTempRoots(roots);
    }
  }, 30_000);
});
