import { describe, expect, it } from "vitest";
import { parseBenchmarkArgs, summarizeBenchmarkRuns } from "../src/benchmark.js";
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
