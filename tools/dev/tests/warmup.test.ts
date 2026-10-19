import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import getPort from "get-port";
import { startBackendPhase } from "../src/composer.js";
import type { ServerReadyContext } from "../src/composer.js";
import { spawnChild } from "../src/spawn.js";
import { OrchestratorError } from "../src/types.js";
import {
  APP_MOUNTED_SELECTOR,
  SCREEN_CONTROL_SELECTOR,
  probeAppMounted,
} from "../src/warmup-browser.js";
import {
  formatReadyLine,
  verifyWarmup,
} from "../src/warmup.js";
import type { RouteProbe, UiProbeResult, WarmupGateTiming, WarmupResult } from "../src/warmup.js";
import { makeTempRoot as createTempRoot, removeTempRoots, silentLogs } from "./temp-dir.js";

/**
The browser automation dependency is mocked so probe-contract tests never
launch a real Chromium (warmup-browser imports it lazily at probe time).
*/
const playwrightMock = vi.hoisted(() => ({
  launch: vi.fn(),
}));

vi.mock("@playwright/test", () => ({
  chromium: { launch: playwrightMock.launch },
}));

/**
Ticket 07 RED suite (written before implementation).

Seams under test (public boundaries only):
- route level: real-gate polling with per-gate timings (deadline, no fixed
  sleeps), timeout surfaces the sidecar-preparation exit code.
- ui level: ready is withheld until the browser probe reports the mounted
  marker plus a screen control; failure exits 5 with diagnostics naming
  the origin, the last probe state, and the timings.
- ready line: always states both origins, the verified level, and timings;
  a route-level line never carries ui timings (listening and UI-warmed are
  never conflated).

Vocabulary: orchestrator, namespace, run identity (spec section 1).
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

class TimeoutError extends Error {
  constructor() {
    super("Timeout 30000ms exceeded.");
    this.name = "TimeoutError";
  }
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error: unknown) {
    return error;
  }
}

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
      return calls >= callsToPass ? { mounted: true, screenControl: "Complete Setup" } : { mounted: false, screenControl: null };
    },
  };
}

describe("ticket 07: probe/marker contract", () => {
  it("pins the shared marker and control selectors", () => {
    expect(APP_MOUNTED_SELECTOR).toBe('[data-app-mounted="true"]');
    expect(SCREEN_CONTROL_SELECTOR).toBe(
      'form[data-testid="setup-form"], [data-testid="route-not-found"]'
    );
  });
});

describe("ticket 07: browser probe observation contract (P21)", () => {
  interface FakePage {
    goto: ReturnType<typeof vi.fn>;
    waitForSelector: ReturnType<typeof vi.fn>;
    $: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }

  function makePage(overrides: Partial<FakePage> = {}): FakePage {
    return {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function makeBrowser(page: FakePage): {
    newPage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } {
    return {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("returns an unmounted observation when the mount marker never appears in budget", async () => {
    const page = makePage({
      waitForSelector: vi.fn().mockRejectedValue(new TimeoutError()),
    });
    const browser = makeBrowser(page);
    playwrightMock.launch.mockResolvedValue(browser);
    await expect(probeAppMounted("http://127.0.0.1:41002", { timeoutMs: 50 })).resolves.toEqual({
      mounted: false,
      screenControl: null,
    });
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("returns an unmounted observation when navigation times out", async () => {
    const page = makePage({
      goto: vi.fn().mockRejectedValue(new TimeoutError()),
    });
    const browser = makeBrowser(page);
    playwrightMock.launch.mockResolvedValue(browser);
    await expect(probeAppMounted("http://127.0.0.1:41002", { timeoutMs: 50 })).resolves.toEqual({
      mounted: false,
      screenControl: null,
    });
    expect(page.waitForSelector).not.toHaveBeenCalled();
  });

  it("a failing close never masks the primary probe error", async () => {
    const primary = new Error("page crashed while waiting for the marker");
    const page = makePage({
      waitForSelector: vi.fn().mockRejectedValue(primary),
      close: vi.fn().mockRejectedValue(new Error("page close failed")),
    });
    const browser = makeBrowser(page);
    browser.close = vi.fn().mockRejectedValue(new Error("browser close failed"));
    playwrightMock.launch.mockResolvedValue(browser);
    const error = await captureFailure(
      probeAppMounted("http://127.0.0.1:41002", { timeoutMs: 50 })
    );
    expect(error).toBe(primary);
  });

  it("a failing close never discards a successful observation", async () => {
    const page = makePage({
      close: vi.fn().mockRejectedValue(new Error("page close failed")),
    });
    const browser = makeBrowser(page);
    browser.close = vi.fn().mockRejectedValue(new Error("browser close failed"));
    playwrightMock.launch.mockResolvedValue(browser);
    await expect(probeAppMounted("http://127.0.0.1:41002", { timeoutMs: 50 })).resolves.toEqual({
      mounted: true,
      screenControl: null,
    });
  });

  it("still throws a non-timeout navigation failure", async () => {
    const page = makePage({
      goto: vi.fn().mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED")),
    });
    const browser = makeBrowser(page);
    playwrightMock.launch.mockResolvedValue(browser);
    await expect(probeAppMounted("http://127.0.0.1:41002", { timeoutMs: 50 })).rejects.toThrow(
      "net::ERR_CONNECTION_REFUSED"
    );
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

  // RED (P2): real runs hand warmup the listener gate's observation, so the
  // now-warm route is never re-probed and routeReadyMs reports the real
  // first-response time (21 s cold, not the re-probed ~66 ms).
  it("uses a precomputed listener-gate timing instead of re-probing the route (P2)", async () => {
    const { now, sleep } = controllableTime();
    let routeProbes = 0;
    const result = await verifyWarmup(
      {
        mode: "route",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => {
          routeProbes += 1;
          return true;
        },
        routeTiming: { attempts: 7, elapsedMs: 21_403 },
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      { now, sleep }
    );
    expect(routeProbes).toBe(0);
    expect(result.level).toBe("route");
    expect(result.timings).toEqual([
      { name: "route-ready", elapsedMs: 21_403, attempts: 7 },
    ]);
  });

  // RED (P13): a server crash during warm-up must abort naming the server
  // (with its own log tail), not the web sidecar.
  it("names the first dead service on the route-gate abort (P13)", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
      {
        mode: "route",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => false,
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      {
        now,
        sleep,
        isChildExited: () => true,
        firstDeadService: () => "server",
        getLogTail: () => ["server-fatal-boot-error"],
      }
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(1);
    const message = (error as Error).message;
    expect(message).toContain("server exited while waiting for readiness");
    expect(message).toContain("server-fatal-boot-error");
    expect(message).not.toContain("web exited");
  });

  it("route gate timeout fails with the sidecar-preparation exit code", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
      {
        mode: "route",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => false,
        deadlineMs: 300,
        intervalMs: 150,
      },
      { now, sleep }
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(4);
  });
});

describe("ticket 07: ui readiness level", () => {
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
    const error = await captureFailure(verifyWarmup(
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
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    const message = (error as Error).message;
    expect(message).toContain("http://127.0.0.1:41002");
    expect(message).toContain("mounted=false");
    expect(message).toContain("uiReadyMs");
  });

  it("a crashing browser probe still fails visibly with exit 5, not a raw throw", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
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
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    expect((error as Error).message).toContain("missing browser binary");
  });

  it("ui gate honors its own deadline, not the route budget", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        probeUi: async () => ({ mounted: false, screenControl: null }),
        deadlineMs: 300,
        uiDeadlineMs: 900,
        intervalMs: 150,
      },
      { now, sleep }
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    expect((error as Error).message).toContain("within 900ms");
  });

  it("bounds each probe attempt by the remaining ui budget (P7)", async () => {
    const started = Date.now();
    const error = await captureFailure(verifyWarmup({
      mode: "ui",
      serverOrigin: "http://127.0.0.1:41001",
      webOrigin: "http://127.0.0.1:41002",
      probeRoute: () => true,
      probeUi: () =>
        new Promise<UiProbeResult>((resolve) => {
          const timer = setTimeout(
            () => { resolve({ mounted: true, screenControl: "form" }); },
            3000
          );
          timer.unref();
        }),
      deadlineMs: 35_000,
      uiDeadlineMs: 150,
      intervalMs: 20,
    }));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    expect((error as Error).message).toContain("within 150ms");
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("exit-5 failure carries the failing service log tail (P7, spec 7.6)", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        probeUi: async () => ({ mounted: false, screenControl: null }),
        deadlineMs: 300,
        intervalMs: 150,
      },
      { now, sleep, getLogTail: () => ["compiling / (1)…", "ready in 1200ms"] }
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(5);
    const message = (error as Error).message;
    expect(message).toContain("Log tail:\n");
    expect(message).toContain("compiling / (1)…");
    expect(message).toContain("ready in 1200ms");
  });

  // RED (P13): the ui gate abort must name the service that actually died.
  it("names the first dead service on the UI-gate abort (P13)", async () => {
    const { now, sleep } = controllableTime();
    // The route gate passes while both services are alive; the server dies
    // right after it, so the ui loop is the gate that observes the death.
    let dead: "server" | null = null;
    const error = await captureFailure(verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => {
          dead = "server";
          return true;
        },
        probeUi: async () => ({ mounted: false, screenControl: null }),
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      {
        now,
        sleep,
        isChildExited: () => dead !== null,
        firstDeadService: () => dead,
        getLogTail: () => ["server-fatal-boot-error"],
      }
    ));
    expect(error).toBeInstanceOf(OrchestratorError);
    expect((error as OrchestratorError).exitCode).toBe(1);
    const message = (error as Error).message;
    expect(message).toContain("server exited while waiting for UI warm-up");
    expect(message).toContain("server-fatal-boot-error");
    expect(message).not.toContain("web exited");
  });

  it("ui mode without a browser probe fails fast instead of hanging", async () => {
    const { now, sleep } = controllableTime();
    const error = await captureFailure(verifyWarmup(
      {
        mode: "ui",
        serverOrigin: "http://127.0.0.1:41001",
        webOrigin: "http://127.0.0.1:41002",
        probeRoute: () => true,
        deadlineMs: 35_000,
        intervalMs: 150,
      },
      { now, sleep }
    ));
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

  it("reports the real first-response time as routeReadyMs (P2)", () => {
    const line = formatReadyLine({
      namespace: "default",
      serverOrigin: "http://127.0.0.1:41001",
      webOrigin: "http://127.0.0.1:41002",
      result: {
        level: "route",
        timings: [{ name: "route-ready", elapsedMs: 21_403, attempts: 7 }],
        totalElapsedMs: 21_403,
      },
    });
    expect(line).toContain("routeReadyMs=21403");
    expect(line).not.toContain("routeReadyMs=66");
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
    return createTempRoot(tempRoots, "notebench-t07-");
  }

  afterEach(() => removeTempRoots(tempRoots), 120_000);

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

  async function startWebFixture(ctx: ServerReadyContext, root: string) {
    const port = await getPort();
    const child = spawnChild({
      executable: process.execPath,
      argv: ["-e", IDLE_SCRIPT],
      service: "web",
      namespace: ctx.namespace,
      runId: ctx.runId,
      logFile: path.join(root, "web-fixture.log"),
      cwd: root,
    });
    return {
      pid: child.pid,
      startTimeMs: child.startTimeMs,
      exited: child.exited,
      logFile: path.join(root, "web-fixture.log"),
      port,
    };
  }

  it("route mode: the pre-verification line never claims ready; the ready line states level + origins", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const uiProbeCalls: string[] = [];
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-route-ns"], env: {} },
      {
        logLine,
        runBuild: () => {},
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
    const { logLine } = silentLogs();
    const seen: { result: WarmupResult | null } = { result: null };
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-hook-ns"], env: {} },
      {
        logLine,
        runBuild: () => {},
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
    const { lines, logLine } = silentLogs();
    const failure = await captureFailure(startBackendPhase(
      { root, argv: ["--namespace", "warmup-ui-fail-ns", "--warmup", "ui"], env: {} },
      {
        logLine,
        runBuild: () => {},
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", HEALTHY_SCRIPT] }),
        startWebPhase: (ctx) => startWebFixture(ctx, root),
        probeWeb: () => Promise.resolve(true),
        probeUi: () => Promise.resolve({ mounted: false, screenControl: null }),
        warmupDeadlineMs: 400,
        warmupUiDeadlineMs: 400,
        pollIntervalMs: 25,
      }
    ));
    expect(failure).toBeInstanceOf(OrchestratorError);
    expect((failure as OrchestratorError).exitCode).toBe(5);
    expect(lines.some((line) => line.includes("level="))).toBe(false);
  }, 30_000);

  it("ui mode with a passing probe reports level=ui with both gate timings", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "warmup-ui-pass-ns", "--warmup", "ui"], env: {} },
      {
        logLine,
        runBuild: () => {},
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
