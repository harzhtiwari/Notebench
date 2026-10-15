import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import getPort from "get-port";
import { startBackendPhase } from "../src/composer.js";
import type { ServerReadyContext } from "../src/composer.js";
import { spawnChild } from "../src/spawn.js";
import { OrchestratorError } from "../src/types.js";
import {
  APP_MOUNTED_SELECTOR,
  SCREEN_CONTROL_SELECTOR,
} from "../src/warmup-browser.js";
import {
  formatReadyLine,
  verifyWarmup,
} from "../src/warmup.js";
import type { RouteProbe, UiProbeResult, WarmupGateTiming, WarmupResult } from "../src/warmup.js";

/**
 * Ticket 07 RED suite (written before implementation).
 *
 * Seams under test (public boundaries only):
 * - route level: real-gate polling with per-gate timings (deadline, no fixed
 *   sleeps), timeout surfaces the sidecar-preparation exit code.
 * - ui level: ready is withheld until the browser probe reports the mounted
 *   marker plus a screen control; failure exits 5 with diagnostics naming
 *   the origin, the last probe state, and the timings.
 * - ready line: always states both origins, the verified level, and timings;
 *   a route-level line never carries ui timings (listening and UI-warmed are
 *   never conflated).
 *
 * Vocabulary: orchestrator, namespace, run identity (spec section 1).
 */

function controllableTime(): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("ticket 07: probe/marker contract", () => {
  it("pins the shared marker and control selectors", () => {
    expect(APP_MOUNTED_SELECTOR).toBe('[data-app-mounted="true"]');
    expect(SCREEN_CONTROL_SELECTOR).toBe('form, [data-testid="route-not-found"]');
  });
});

describe("ticket 07: route readiness level", () => {
  it("polls the route probe and records per-gate timings", async () => {
    const { now, sleep } = controllableTime();
    let calls = 0;
    const probeRoute: RouteProbe = () => {
      calls += 1;
      return calls >= 3;
    };
    const result = await verifyWarmup(
      {
        mode: "route",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute,
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      { now, sleep }
    );
    expect(result.level).toBe("route");
    expect(calls).toBe(3);
    expect(result.timings).toHaveLength(1);
    const gate: WarmupGateTiming | undefined = result.timings[0];
    expect(gate).toMatchObject({ name: "route-ready", attempts: 3 });
    expect(gate?.elapsedMs).toBeGreaterThanOrEqual(300);
    expect(result.totalElapsedMs).toBeGreaterThanOrEqual(300);
  });

  it("route gate timeout fails with the sidecar-preparation exit code", async () => {
    const { now, sleep } = controllableTime();
    const error = await verifyWarmup(
      {
        mode: "route",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => false,
        deadlineMs: 300,
        intervalMs: 150,
      },
      { now, sleep }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(4);
  });
});

describe("ticket 07: ui readiness level", () => {
  function mountedAfter(callsToPass: number): {
    probe: (webOrigin: string) => Promise<UiProbeResult>;
    seen: string[];
  } {
    const seen: string[] = [];
    let calls = 0;
    return {
      seen,
      probe: async (webOrigin: string) => {
        seen.push(webOrigin);
        calls += 1;
        if (calls >= callsToPass) return { mounted: true, screenControl: "Complete Setup" };
        return { mounted: false, screenControl: null };
      },
    };
  }

  it("withholds ready until the marker and a screen control pass", async () => {
    const { now, sleep } = controllableTime();
    const { probe, seen } = mountedAfter(3);
    const result = await verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        probeUi: probe,
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      { now, sleep }
    );
    expect(result.level).toBe("ui");
    expect(seen).toEqual([
      "http://127.0.0.1:41002",
      "http://127.0.0.1:41002",
      "http://127.0.0.1:41002",
    ]);
    const names = result.timings.map((t) => t.name);
    expect(names).toEqual(["route-ready", "ui-ready"]);
  });

  it("ui failure exits 5 with the origin, last probe state, and timings", async () => {
    const { now, sleep } = controllableTime();
    const error = await verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        probeUi: async () => ({ mounted: false, screenControl: null }),
        deadlineMs: 300,
        intervalMs: 150,
      },
      { now, sleep }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    const message = (error as Error).message;
    expect(message).toContain("http://127.0.0.1:41002");
    expect(message).toContain("mounted=false");
    expect(message).toContain("uiReadyMs");
  });

  it("a crashing browser probe still fails visibly with exit 5, not a raw throw", async () => {
    const { now, sleep } = controllableTime();
    const error = await verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        probeUi: async () => {
          throw new Error("chromium launch failed: missing browser binary");
        },
        deadlineMs: 300,
        intervalMs: 150,
      },
      { now, sleep }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    expect((error as Error).message).toContain("missing browser binary");
  });

  it("ui mode without a browser probe fails fast instead of hanging", async () => {
    const { now, sleep } = controllableTime();
    const error = await verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      { now, sleep }
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(1);
  });
});

describe("ticket 07: ready line states what was verified", () => {
  it("route-level line carries both origins, the level, and route timings only", () => {
    const line = formatReadyLine({
      namespace: "default",
      serverOrigin: "http://127.0.0.1:41001",
      webOrigin: "http://127.0.0.1:41002",
      result: {
        level: "route",
        timings: [{ name: "route-ready", elapsedMs: 812, attempts: 6 }],
        totalElapsedMs: 812,
      },
    });
    expect(line).toContain("level=route");
    expect(line).toContain("serverOrigin=http://127.0.0.1:41001");
    expect(line).toContain("webOrigin=http://127.0.0.1:41002");
    expect(line).toContain("routeReadyMs=812");
    expect(line).not.toContain("uiReadyMs");
  });

  it("ui-level line carries both gate timings without conflating them", () => {
    const line = formatReadyLine({
      namespace: "default",
      serverOrigin: "http://127.0.0.1:41001",
      webOrigin: "http://127.0.0.1:41002",
      result: {
        level: "ui",
        timings: [
          { name: "route-ready", elapsedMs: 812, attempts: 6 },
          { name: "ui-ready", elapsedMs: 2140, attempts: 3 },
        ],
        totalElapsedMs: 2952,
      },
    });
    expect(line).toContain("level=ui");
    expect(line).toContain("routeReadyMs=812");
    expect(line).toContain("uiReadyMs=2140");
  });
});

describe("ticket 07: composer warmup wiring (log contract)", () => {
  const tempRoots: string[] = [];

  function makeTempRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), "notebench-t07-"));
    tempRoots.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop() as string;
      // Windows lock errors persist longer under parallel suites: retry with
      // a generous budget before giving up.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          rmSync(dir, { recursive: true, force: true });
          break;
        } catch (error: unknown) {
          const code = (error as { code?: string }).code;
          if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 59) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw error;
        }
      }
    }
  }, 120_000);

  const HEALTHY_SCRIPT = `
const http = require("http");
const port = Number(process.env["PORT"]);
const host = process.env["HOST"] || "127.0.0.1";
http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host);
`;

  const IDLE_SCRIPT = `setInterval(() => {}, 1000);`;

  function captureLogs(): { lines: string[]; logLine: (line: string) => void } {
    const lines: string[] = [];
    return { lines, logLine: (line: string) => void lines.push(line) };
  }

  async function startWebFixture(ctx: ServerReadyContext, root: string) {
    const port = await getPort();
    const child = spawnChild({
      executable: process.execPath,
      argv: ["-e", IDLE_SCRIPT],
      service: "web",
      namespace: ctx.namespace,
      runId: ctx.runId,
      logFile: join(root, "web-fixture.log"),
      cwd: root,
    });
    return {
      pid: child.pid,
      startTimeMs: child.startTimeMs,
      exited: child.exited,
      logFile: join(root, "web-fixture.log"),
      port,
    };
  }

  it("route mode: the pre-verification line never claims ready; the ready line states level + origins", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = captureLogs();
    const uiProbeCalls: string[] = [];
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-route-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", HEALTHY_SCRIPT] }),
        startWebPhase: (ctx) => startWebFixture(ctx, root),
        probeWeb: () => Promise.resolve(true),
        probeUi: (webOrigin: string) => {
          uiProbeCalls.push(webOrigin);
          return Promise.resolve({ mounted: true, screenControl: "form" });
        },
        warmupDeadlineMs: 5000,
        pollIntervalMs: 25,
      }
    );
    try {
      expect(lines.some((line) => line.includes("web ready"))).toBe(false);
      const ready = lines.filter((line) => line.includes("level=route"));
      expect(ready).toHaveLength(1);
      expect(ready[0]).toContain(`serverOrigin=http://127.0.0.1:`);
      expect(ready[0]).toContain(`webOrigin=http://127.0.0.1:`);
      expect(ready[0]).toContain("routeReadyMs=");
      expect(ready[0]).not.toContain("uiReadyMs");
      expect(uiProbeCalls).toHaveLength(0);
    } finally {
      await handle.shutdown();
    }
  }, 30_000);

  it("route mode: reports the verified warmup result through the onWarmup hook", async () => {
    const root = makeTempRoot();
    const { logLine } = captureLogs();
    const seen: { result: WarmupResult | null } = { result: null };
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-hook-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", HEALTHY_SCRIPT] }),
        startWebPhase: (ctx) => startWebFixture(ctx, root),
        probeWeb: () => Promise.resolve(true),
        onWarmup: (result) => {
          seen.result = result;
        },
        warmupDeadlineMs: 5000,
        pollIntervalMs: 25,
      }
    );
    try {
      expect(seen.result?.level).toBe("route");
      expect(seen.result?.timings.map((t) => t.name)).toEqual(["route-ready"]);
    } finally {
      await handle.shutdown();
    }
  }, 30_000);

  it("ui mode with a failing probe withholds ready and fails with exit 5", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = captureLogs();
    const failure = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-ui-fail-ns", "--warmup", "ui"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", HEALTHY_SCRIPT] }),
        startWebPhase: (ctx) => startWebFixture(ctx, root),
        probeWeb: () => Promise.resolve(true),
        probeUi: () => Promise.resolve({ mounted: false, screenControl: null }),
        warmupDeadlineMs: 400,
        pollIntervalMs: 25,
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(OrchestratorError);
    expect((failure as OrchestratorError).exitCode).toBe(5);
    expect(lines.some((line) => line.includes("level="))).toBe(false);
  }, 30_000);

  it("ui mode with a passing probe reports level=ui with both gate timings", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = captureLogs();
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-ui-pass-ns", "--warmup", "ui"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", HEALTHY_SCRIPT] }),
        startWebPhase: (ctx) => startWebFixture(ctx, root),
        probeWeb: () => Promise.resolve(true),
        probeUi: () => Promise.resolve({ mounted: true, screenControl: "form" }),
        warmupDeadlineMs: 5000,
        pollIntervalMs: 25,
      }
    );
    try {
      const ready = lines.filter((line) => line.includes("level=ui"));
      expect(ready).toHaveLength(1);
      expect(ready[0]).toContain("routeReadyMs=");
      expect(ready[0]).toContain("uiReadyMs=");
    } finally {
      await handle.shutdown();
    }
  }, 30_000);
});
