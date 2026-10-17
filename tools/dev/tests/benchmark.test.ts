import { describe, expect, it, vi } from "vitest";
import {
  benchmarkFailureExitCode,
  parseBenchmarkArgs,
  runBenchmarkBatches,
  runOnce,
  summarizeBenchmarkRuns,
} from "../src/benchmark.js";
import type { SpawnFn } from "../src/spawn.js";
import { OrchestratorError } from "../src/types.js";
import { makeTempRoot, removeTempRoots } from "./temp-dir.js";
/**
 * Ticket 08 RED suite: the benchmark harness must accept both `--flag=value`
 * and `--flag value` forms (the documented usage shows the space form), so a
 * `--warmup ui` invocation never silently benchmarks route mode.
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
      captured.push(args.map((arg) => String(arg)).join(" "));
    });
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    const spawnFn: SpawnFn = () => ({
      pid: 99999,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "exit") exitListeners.push(listener);
      },
    });
    let reaped = false;
    try {
      await runOnce(root, "bench-wire", "route", "cold", 7, {
        backend: {
          runBuild: () => undefined,
          spawnFn,
          // Fake children never exit on their own. Shutdown's first liveness
          // check happens inside its teardown (the run is already closing),
          // so resolving the captured exits there lets shutdown return
          // without sitting out the reap grace — and the false verdict
          // guarantees pid 99999 is never signaled.
          isPidLive: () => {
            if (reaped === false) {
              reaped = true;
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
      expect(webStartup.filter((line) => line.startsWith(tag) === false)).toEqual([]);

      const devReady = captured.filter((line) => line.includes("[dev] ready"));
      expect(devReady.some((line) => line.startsWith(tag))).toBe(true);
    } finally {
      logSpy.mockRestore();
      await removeTempRoots(roots);
    }
  }, 30_000);
});
