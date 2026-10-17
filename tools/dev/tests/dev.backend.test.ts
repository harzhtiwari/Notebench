import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { uptime as osUptime } from "node:os";
import { spawn as nodeSpawn } from "node:child_process";
import getPort from "get-port";
import { parseNamespace } from "../src/args.js";
import { resolveRunPaths } from "../src/paths.js";
import { spawnChild } from "../src/spawn.js";
import type { SpawnFn, SpawnedChild } from "../src/spawn.js";
import { readLogTail } from "../src/logs.js";
import { defaultPidExists, readIdentity, writeIdentity } from "../src/identity.js";
import type { RunIdentity } from "../src/identity.js";
import {
  getProcessStartTimeMs,
  createOsPidLivenessChecker,
  createOsPidOwnershipChecker,
} from "../src/process-start-time.js";
import { serverCompiledDeps, ensureServerFreshness } from "../src/freshness.js";
import { resolveE2EBaseUrl, resolveE2EWebPort } from "../src/e2e-ports.js";
import { startBackendPhase, runBackendCommand, startDefaultWebPhase } from "../src/composer.js";
import {
  DEV_RUN_ID_ENV,
  ORCHESTRATOR_HOST,
  SERVER_HEALTH_PATH,
  SERVER_PORT_FILE_ENV,
  SERVER_PORT_FILE_ENV_ALIAS,
  nestedServerPortResidue,
} from "../src/composer.js";
import type {
  BackendPhaseDeps,
  ServerReadyContext,
  ServerReadyTimings,
  ServerSpawnContext,
  ServerSpawnRequest,
} from "../src/composer.js";
import { PROCESS_START_TIME_TOLERANCE_MS } from "../src/process-start-time.js";
import { OrchestratorError } from "../src/types.js";
import { makeTempRoot as createTempRoot, removeTempRoots, silentLogs } from "./temp-dir.js";

/**
 * Ticket 03 RED suite (written before implementation).
 *
 * Seams under test (public boundaries only):
 * - composer: startBackendPhase/runBackendCommand observed via real HTTP,
 *   real files, real child processes, and exit codes.
 * - freshness: ensureServerFreshness observed via injected build-runner calls.
 * - start-time: getProcessStartTimeMs observed via real OS calls.
 * - e2e-ports: resolveE2EBaseUrl observed return values with injected fs/env.
 *
 * Vocabulary: orchestrator, server, namespace, run identity (spec section 1).
 */

const tempRoots: string[] = [];

function makeTempRoot(): string {
  return createTempRoot(tempRoots, "notebench-t03-");
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
}).listen(port, host, () => { console.log("fixture listening on " + port); });
`;

const CRASHING_SCRIPT = `
for (let i = 1; i <= 100; i += 1) { console.log("line-" + i); }
console.error("fatal-boot-error");
process.exit(1);
`;

const NEVER_LISTENING_SCRIPT = `setInterval(() => {}, 1000);`;

function healthySpawn(): ServerSpawnRequest {
  return {
    executable: process.execPath,
    argv: ["-e", HEALTHY_SCRIPT],
  };
}

describe("ticket 03: OS process start-time reader", () => {
  it("reports the current process start time within tolerance of clock-minus-uptime", async () => {
    // A single powershell read can transiently fail under parallel load;
    // retry the way production liveness polling does before asserting.
    let reported: number | null = null;
    for (let attempt = 0; attempt < 3 && reported === null; attempt += 1) {
      reported = await getProcessStartTimeMs(process.pid);
      if (reported === null) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    expect(reported).not.toBeNull();
    const approx = Date.now() - process.uptime() * 1000;
    expect(Math.abs((reported as number) - approx)).toBeLessThan(5000);
  }, 30_000);

  it("returns null for a dead PID and for invalid PIDs (unverifiable means stale)", async () => {
    await expect(getProcessStartTimeMs(2_147_483_647)).resolves.toBeNull();
    await expect(getProcessStartTimeMs(-3)).resolves.toBeNull();
    await expect(getProcessStartTimeMs(Number.NaN)).resolves.toBeNull();
  }, 30_000);

  it("builds an async liveness checker that treats unverifiable PIDs as stale", async () => {
    const isPidLive = createOsPidLivenessChecker();
    const startTimeMs = await getProcessStartTimeMs(process.pid);
    expect(startTimeMs).not.toBeNull();
    await expect(isPidLive(process.pid, startTimeMs as number)).resolves.toBe(true);
    await expect(isPidLive(process.pid, 1)).resolves.toBe(false);
    await expect(isPidLive(2_147_483_647, 1)).resolves.toBe(false);
  }, 30_000);
});

describe("ticket 08: shutdown returns only after owned children are reaped", () => {  it("waits for the child exit promise instead of returning after signaling", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    const spawnFn: SpawnFn = (_executable, _argv, _options) => ({
      pid: 4242,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "exit") exitListeners.push(listener);
      },
    });
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "shutdown-reap-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
        spawnFn,
        probeHealth: () => Promise.resolve(true),
      }
    );
    let shutdownReturned = false;
    const shutdownPromise = handle.shutdown().then((code) => {
      shutdownReturned = true;
      return code;
    });
    // Teardown with fakes settles in microtasks; the exit wait must hold
    // shutdown open past this point until the child is reaped.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shutdownReturned).toBe(false);
    for (const listener of exitListeners) listener(0, null);
    await expect(shutdownPromise).resolves.toBe(0);
    expect(shutdownReturned).toBe(true);
  }, 30_000);

  it("killing the server child stops the web sibling and exits non-zero (real processes)", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    let webPid = 0;
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "kill-server-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: healthySpawn,
        startWebPhase: (ctx) => (async () => {
          const port = await getPort();
          const child = spawnChild({
            executable: process.execPath,
            argv: ["-e", NEVER_LISTENING_SCRIPT],
            service: "web",
            namespace: ctx.namespace,
            runId: ctx.runId,
            logFile: join(root, "web-fixture.log"),
            cwd: root,
          });
          webPid = child.pid;
          return {
            pid: child.pid,
            startTimeMs: child.startTimeMs,
            exited: child.exited,
            logFile: join(root, "web-fixture.log"),
            port,
          };
        })(),
        probeWeb: () => Promise.resolve(true),
        warmupDeadlineMs: 5000,
        warmupUiDeadlineMs: 5000,
        pollIntervalMs: 25,
      }
    );
    expect(webPid).toBeGreaterThan(0);
    process.kill(handle.serverChild.pid);
    const code = await handle.waitForExit();
    expect(code).toBe(1);
    expect(lines.some((line) => line.includes("[server] exited unexpectedly"))).toBe(true);
    expect(() => process.kill(webPid, 0)).toThrow();
    expect(existsSync(handle.paths.serverPortFile)).toBe(false);
    expect(existsSync(handle.paths.identityFile)).toBe(false);
  }, 60_000);
});

// RED (P2 headline bug): the listener gate probes the real first request
// (the cold compile) and the result was discarded; the later warmup re-probed
// the now-warm route and reported ~66 ms. The gate result must be captured
// and flow through warmup to the ready line.
describe("ticket 03: truthful listener-gate timing (P2)", () => {
  it("captures the listener gate's attempts/elapsed into the WebStarted record", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "gate-timing-ns");
    let t = 1_000_000;
    const now = (): number => t;
    const sleep = async (ms: number): Promise<void> => {
      t += ms;
    };
    let probes = 0;
    const serverChild: SpawnedChild = {
      pid: 999,
      startTimeMs: 1,
      service: "server",
      namespace: "gate-timing-ns",
      runId: "run-gate",
      logFile: paths.serverLogFile,
      executable: process.execPath,
      argv: ["-e", ""],
      exited: new Promise<never>(() => undefined),
    };
    const started = await startDefaultWebPhase(
      {
        root,
        namespace: "gate-timing-ns",
        runId: "run-gate",
        host: ORCHESTRATOR_HOST,
        serverPort: 41_001,
        reservedWebPort: 41_002,
        paths,
        serverChild,
        timings: { healthAttempts: 1, healthElapsedMs: 5 },
        isRunOver: () => false,
      },
      {
        logLine,
        spawnFn: () => ({ pid: 4242, on: () => undefined }),
        probeWeb: async () => {
          probes += 1;
          return probes >= 3;
        },
        now,
        sleep,
        pollIntervalMs: 150,
      },
      {}
    );
    expect(started.routeTiming).toEqual({ attempts: 3, elapsedMs: 300 });
  }, 30_000);

  it("feeds the listener-gate timing into warmup so the route is never re-probed", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const gateProbes: string[] = [];
    const warmupProbes: string[] = [];
    const webDeps: BackendPhaseDeps = {
      logLine,
      createWebSpawn: () => ({
        executable: process.execPath,
        argv: ["-e", NEVER_LISTENING_SCRIPT],
      }),
      probeWeb: (url: string) => {
        gateProbes.push(url);
        return Promise.resolve(true);
      },
      pollIntervalMs: 25,
    };
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "truthy-timing-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: healthySpawn,
        probeWeb: (url: string) => {
          warmupProbes.push(url);
          return Promise.resolve(true);
        },
        startWebPhase: (ctx: ServerReadyContext) => startDefaultWebPhase(ctx, webDeps, {}),
        warmupDeadlineMs: 5000,
        pollIntervalMs: 25,
      }
    );
    try {
      // The gate probed the route exactly once; warmup reused that observation
      // instead of re-probing the now-warm URL.
      expect(gateProbes).toHaveLength(1);
      expect(warmupProbes).toEqual([]);
      const ready = lines.filter((line) => line.includes("level=route"));
      expect(ready).toHaveLength(1);
      expect(ready[0]).toContain("routeReadyMs=");
    } finally {
      await handle.shutdown();
    }
  }, 30_000);
});

// RED (P13): a server crash during warm-up must abort as soon as the
// service actually dies and name that service with its tail — not wait for
// the crash teardown to settle and then blame the web sidecar.
describe("ticket 03: warm-up abort names the first dead service (P13)", () => {
  it("reports a mid-warm-up server crash as a server exit with the server tail", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    let serverPid = 0;
    let webChildPid = 0;
    const startedAt = Date.now();
    const runPromise = startBackendPhase(
      { root, argv: ["--namespace", "p13-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: healthySpawn,
        onServerReady: (ctx: ServerReadyContext) => {
          serverPid = ctx.serverChild.pid;
        },
        startWebPhase: (ctx: ServerReadyContext) => {
          const child = spawnChild({
            executable: process.execPath,
            argv: ["-e", NEVER_LISTENING_SCRIPT],
            service: "web",
            namespace: ctx.namespace,
            runId: ctx.runId,
            logFile: join(root, "p13-web-fixture.log"),
            cwd: root,
          });
          webChildPid = child.pid;
          return Promise.resolve({
            pid: child.pid,
            startTimeMs: child.startTimeMs,
            exited: child.exited,
            logFile: join(root, "p13-web-fixture.log"),
            port: ctx.reservedWebPort,
          });
        },
        probeWeb: () => Promise.resolve(false),
        warmupDeadlineMs: 60_000,
        pollIntervalMs: 25,
      }
    );
    try {
      const deadline = Date.now() + 20_000;
      while (
        !lines.some((line) => line.includes("[dev] web listening")) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(serverPid).toBeGreaterThan(0);
      process.kill(serverPid);
      const failure = await runPromise.then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).not.toBeNull();
      expect(failure).toBeInstanceOf(OrchestratorError);
      expect((failure as OrchestratorError).exitCode).toBe(1);
      const message = (failure as Error).message;
      // The abort names the server (not the web sidecar) and carries the
      // server's log tail; it must not run out the warm-up deadline.
      expect(message).toContain("server exited while waiting for readiness");
      expect(message).toContain("fixture listening on");
      expect(message).not.toContain("web exited");
      expect(Date.now() - startedAt).toBeLessThan(30_000);
    } finally {
      if (webChildPid > 0) {
        try {
          process.kill(webChildPid);
        } catch {
          // Already reaped by the crash teardown.
        }
      }
      await runPromise.catch(() => null);
    }
  }, 60_000);
});

// RED (P19): the health gate can pass at the instant the server dies.
// Never print the backend ready line or start the web phase for a backend
// that already exited.
describe("ticket 03: post-gate exit re-check (P19)", () => {
  it("never prints backend ready or starts the web phase for an exited server", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "p19-ns");
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    const spawnFn: SpawnFn = () => ({
      pid: 2_147_483_500,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "exit") exitListeners.push(listener);
      },
    });
    let webPhaseStarted = false;
    let hookCalled = false;
    const code = await runBackendCommand(
      { root, argv: ["--namespace", "p19-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
        spawnFn,
        isPidLive: () => false,
        probeHealth: async () => {
          // The child exit lands exactly as the gate passes.
          for (const listener of exitListeners) listener(1, null);
          return true;
        },
        onServerReady: () => {
          hookCalled = true;
        },
        startWebPhase: () => {
          webPhaseStarted = true;
          return Promise.resolve({
            pid: 2_147_483_501,
            startTimeMs: 1,
            exited: new Promise<never>(() => undefined),
            logFile: paths.webLogFile,
            port: 41_003,
          });
        },
      }
    );
    expect(code).toBe(1);
    expect(webPhaseStarted).toBe(false);
    expect(hookCalled).toBe(false);
    expect(lines.some((line) => line.includes("[dev] backend ready"))).toBe(false);
    expect(lines.join("\n")).toContain("server exited before the backend ready line");
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 30_000);
});

// RED (P20): signal handlers must be removed on every exit path (crash,
// shutdown, catch) and shutdown must be re-entrancy guarded so concurrent
// triggers share one teardown.
describe("round-2 P20: shutdown/signal lifecycle", () => {
  function lifecycleDeps(
    handlers: Map<string, () => void>,
    removed: string[],
    exitListeners: Array<(...args: unknown[]) => void>
  ): BackendPhaseDeps {
    return {
      runBuild: () => undefined,
      createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
      spawnFn: () => ({
        pid: 2_147_483_500,
        on: (event: string, listener: (...args: unknown[]) => void) => {
          if (event === "exit") exitListeners.push(listener);
        },
      }),
      probeHealth: () => Promise.resolve(true),
      onSignal: (signal: string, handler: () => void) => {
        handlers.set(signal, handler);
      },
      removeSignal: (signal: string) => {
        removed.push(signal);
      },
    };
  }

  it("removes signal handlers when a crash settles the run", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const handlers = new Map<string, () => void>();
    const removed: string[] = [];
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "p20-crash-ns"], env: {} },
      {
        ...lifecycleDeps(handlers, removed, exitListeners),
        logLine,
        isPidLive: () => false,
      }
    );
    for (const listener of exitListeners) listener(1, null);
    await expect(handle.waitForExit()).resolves.toBe(1);
    expect(removed).toContain("SIGINT");
    expect(removed).toContain("SIGTERM");
  }, 30_000);

  it("memoizes shutdown so concurrent triggers run one teardown pass", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const handlers = new Map<string, () => void>();
    const removed: string[] = [];
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    let reaped = false;
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "p20-shutdown-ns"], env: {} },
      {
        ...lifecycleDeps(handlers, removed, exitListeners),
        logLine,
        // Resolve the fake child's exit during the first liveness check so
        // shutdown reaps promptly without signaling a fake PID.
        isPidLive: () => {
          if (!reaped) {
            reaped = true;
            for (const listener of exitListeners) listener(0, null);
          }
          return false;
        },
      }
    );
    const [first, second] = await Promise.all([handle.shutdown(), handle.shutdown()]);
    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(removed.filter((signal) => signal === "SIGINT")).toHaveLength(1);
    expect(removed.filter((signal) => signal === "SIGTERM")).toHaveLength(1);
  }, 30_000);
});

// RED (P15): benchmark's cold reset is a prep hook that must run only after
// the exclusive namespace claim and before the freshness builds.
describe("round-2 P15: backend prep hook ordering", () => {
  it("runs prep after the claim and before the freshness builds", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "prep-order-ns");
    const order: string[] = [];
    const exitListeners: Array<(...args: unknown[]) => void> = [];
    const spawnFn: SpawnFn = () => ({
      pid: 2_147_483_500,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (event === "exit") exitListeners.push(listener);
      },
    });
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "prep-order-ns"], env: {} },
      {
        logLine,
        prep: () => {
          // The claim exists by the time prep runs: prep may safely touch
          // namespace-owned state (the benchmark's cold reset does).
          expect(existsSync(paths.identityFile)).toBe(true);
          order.push("prep");
        },
        runBuild: () => {
          order.push("build");
        },
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
        spawnFn,
        probeHealth: () => Promise.resolve(true),
      }
    );
    const shutdownPromise = handle.shutdown();
    for (const listener of exitListeners) listener(0, null);
    await shutdownPromise;
    expect(order[0]).toBe("prep");
    expect(order).toContain("build");
  }, 30_000);

  it("never runs prep for a busy namespace", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "prep-busy-ns");
    const ownStart = Date.now() - process.uptime() * 1000;
    const live: RunIdentity = {
      runId: "run-live",
      namespace: "prep-busy-ns",
      orchestratorPid: process.pid,
      orchestratorStartTimeMs: ownStart,
      children: {},
      createdAt: new Date().toISOString(),
    };
    await writeIdentity(paths.identityFile, live);
    let prepRan = false;
    const failure = await startBackendPhase(
      { root, argv: ["--namespace", "prep-busy-ns"], env: {} },
      {
        logLine,
        prep: () => {
          prepRan = true;
        },
        runBuild: () => undefined,
        createServerSpawn: () => healthySpawn(),
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    expect(prepRan).toBe(false);
  }, 30_000);
});

describe("ticket 03: freshness gates for server-consumed compiled outputs", () => {
  it("inventories exactly the workspace deps the server consumes as compiled output", () => {
    const root = makeTempRoot();
    const names = serverCompiledDeps(root).map((dep) => dep.name);
    expect(names).toEqual([
      "@notebench/contracts",
      "@notebench/logger",
      "@notebench/domain-ops",
      "@notebench/domain-account",
      "@notebench/domain-notebooks",
      "@notebench/infra-db",
      "@notebench/infra-doc-worker",
      "@notebench/infra-llm",
      "@notebench/infra-vault",
    ]);
    expect(names).not.toContain("@notebench/ui");
    expect(names).not.toContain("next");
  });

  it("rebuilds missing dist entries and skips fresh ones", async () => {
    const root = makeTempRoot();
    const built: string[] = [];
    const mtimes = new Map<string, number | null>();
    const result = await ensureServerFreshness(root, {
      statMtimeMs: (path: string) => Promise.resolve(mtimes.get(path) ?? null),
      listFilesRecursive: () => Promise.resolve([]),
      runBuild: (dep) => {
        built.push(dep.name);
      },
    });
    expect(built).toHaveLength(9);
    expect(result.rebuilt).toHaveLength(9);
    expect(result.skipped).toEqual([]);
  });

  it("rebuilds stale outputs (src newer than dist) and skips fresh ones", async () => {
    const root = makeTempRoot();
    const deps = serverCompiledDeps(root);
    const mtimes = new Map<string, number | null>();
    for (const dep of deps) {
      mtimes.set(join(dep.dir, dep.distEntry), 1000);
    }
    const staleDep = deps[1] as { name: string; dir: string; distEntry: string; srcDir: string };
    const staleSrc = join(staleDep.srcDir, "index.ts");
    mtimes.set(staleSrc, 2000);
    const built: string[] = [];
    const result = await ensureServerFreshness(root, {
      statMtimeMs: (path: string) => Promise.resolve(mtimes.get(path) ?? null),
      listFilesRecursive: (dir: string) => Promise.resolve(dir === staleDep.srcDir ? [staleSrc] : []),
      runBuild: (dep) => {
        built.push(dep.name);
      },
    });
    expect(built).toEqual([staleDep.name]);
    expect(result.skipped).toHaveLength(8);
  });

  it("never invokes the web production export", async () => {
    const root = makeTempRoot();
    const commands: string[] = [];
    await ensureServerFreshness(root, {
      statMtimeMs: () => Promise.resolve(null),
      listFilesRecursive: () => Promise.resolve([]),
      runBuild: (dep) => {
        commands.push(dep.name);
      },
    });
    expect(commands.join(" ")).not.toContain("web");
    expect(commands.join(" ")).not.toContain("next");
    expect(commands.join(" ")).not.toContain("export");
  });
});

describe("ticket 03: namespace-aware end-to-end port reader", () => {
  it("prefers the namespaced web.port over legacy flat paths", () => {
    const port = resolveE2EWebPort("/repo", { NOTEBENCH_NAMESPACE: "team-a" }, {
      exists: (p: string) => p === join("/repo", ".tmp", "ports", "team-a", "web.port"),
      readFile: () => "3210",
    });
    expect(port).toBe(3210);
  });

  it("falls back to legacy flat paths, then PORT env, then the default", () => {
    const legacy = resolveE2EWebPort("/repo", {}, {
      exists: (p: string) => p === join("/repo", ".tmp", "ports", "web.port"),
      readFile: () => "3101",
    });
    expect(legacy).toBe(3101);
    const fromEnv = resolveE2EWebPort("/repo", { PORT: "3999" }, {
      exists: () => false,
      readFile: () => "",
    });
    expect(fromEnv).toBe(3999);
    const fallback = resolveE2EWebPort("/repo", {}, {
      exists: () => false,
      readFile: () => "",
    });
    expect(fallback).toBe(3100);
  });

  it("resolves the namespace from NOTEBENCH_NAMESPACE (NB_NAMESPACE alias)", () => {
    const viaCanonical = resolveE2EWebPort("/repo", { NOTEBENCH_NAMESPACE: "team-a" }, {
      exists: (p: string) => p === join("/repo", ".tmp", "ports", "team-a", "web.port"),
      readFile: () => "3221",
    });
    expect(viaCanonical).toBe(3221);
    const viaAlias = resolveE2EWebPort("/repo", { NB_NAMESPACE: "team-b" }, {
      exists: (p: string) => p === join("/repo", ".tmp", "ports", "team-b", "web.port"),
      readFile: () => "3222",
    });
    expect(viaAlias).toBe(3222);
  });

  // RED (P26): an invalid namespace must fail loudly at config load instead
  // of silently reading the `default` namespace's records.
  it("fails loudly on an invalid namespace env value instead of reading the default", () => {
    expect(() =>
      resolveE2EWebPort("/repo", { NOTEBENCH_NAMESPACE: "Bad Name" }, {
        exists: () => false,
        readFile: () => "",
      })
    ).toThrow(/Bad Name/);
    expect(() =>
      resolveE2EWebPort("/repo", { NB_NAMESPACE: "trailing." }, {
        exists: () => false,
        readFile: () => "",
      })
    ).toThrow(/trailing\./);
  });

  // RED (P26): flat `web.port` precedes the pre-orchestrator residue, per
  // spec 7.3 (a stale e2e-web.port must not shadow a live flat file).
  it("prefers the flat web.port over the pre-orchestrator e2e-web.port residue", () => {
    const port = resolveE2EWebPort("/repo", {}, {
      exists: (p: string) =>
        p === join("/repo", ".tmp", "ports", "e2e-web.port") ||
        p === join("/repo", ".tmp", "ports", "web.port"),
      readFile: (p: string) => (p.endsWith("e2e-web.port") ? "3111" : "3222"),
    });
    expect(port).toBe(3222);
  });

  it("keeps explicit PLAYWRIGHT base URLs first and builds from the resolved port otherwise", () => {
    const explicit = resolveE2EBaseUrl("/repo", { PLAYWRIGHT_TEST_BASE_URL: "http://example.invalid:9999" }, {
      exists: () => false,
      readFile: () => "",
    });
    expect(explicit).toBe("http://example.invalid:9999");
    // An explicit URL wins without namespace resolution, so a bad namespace
    // env value cannot break a run that pins its base URL.
    const explicitWithBadNamespace = resolveE2EBaseUrl(
      "/repo",
      { PLAYWRIGHT_TEST_BASE_URL: "http://example.invalid:9999", NOTEBENCH_NAMESPACE: "Bad Name" },
      { exists: () => false, readFile: () => "" }
    );
    expect(explicitWithBadNamespace).toBe("http://example.invalid:9999");
    const derived = resolveE2EBaseUrl("/repo", {}, {
      exists: (p: string) => p === join("/repo", ".tmp", "ports", "default", "web.port"),
      readFile: () => "3233",
    });
    expect(derived).toBe("http://127.0.0.1:3233");
  });
});

describe("ticket 03: spawn tees child output for failure tails", () => {
  it("forwards child stdout/stderr to the injected output handler with shell:false", async () => {
    const seen: Array<{ exe: string; argv: string[]; shell: unknown }> = [];
    const child = spawnChild(
      {
        executable: process.execPath,
        argv: ["-e", "console.log(1)"],
        service: "server",
        namespace: "default",
        runId: "run-tee",
        logFile: "/tmp/tee.log",
        onOutput: () => undefined,
      },
      {
        spawnFn: (exe, argv, options) => {
          seen.push({ exe, argv, shell: options.shell });
          return { pid: 4243, on: () => undefined };
        },
      }
    );
    expect(child.pid).toBe(4243);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.shell).toBe(false);
  });
});

describe("ticket 03: orchestrator contract pins (spec 5.7, 7.2)", () => {
  it("uses Notebench-owned port-file env names with the NB_ alias", () => {
    expect(SERVER_PORT_FILE_ENV).toBe("NOTEBENCH_SERVER_PORT_FILE");
    expect(SERVER_PORT_FILE_ENV_ALIAS).toBe("NB_SERVER_PORT_FILE");
    expect(DEV_RUN_ID_ENV).toBe("NOTEBENCH_DEV_RUN_ID");
  });

  it("locates the pre-orchestrator nested port-file residue exactly", () => {
    expect(nestedServerPortResidue("/repo")).toBe(
      join("/repo", "apps", "server", ".tmp", "ports", "server.port")
    );
  });

  it("keeps the OS start-time tolerance at the documented budget", () => {
    expect(PROCESS_START_TIME_TOLERANCE_MS).toBe(2000);
  });
});

describe("ticket 03: backend startup end-to-end (real processes)", () => {
  it("starts the server before the web hook and gates the hook on a real /healthz success", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    let hookSawHealthy = false;
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "order-ns"], env: {} },
      {
        logLine,
        createServerSpawn: healthySpawn,
        runBuild: () => undefined,
        onServerReady: (ctx: ServerReadyContext) => {
          expect(ctx.namespace).toBe("order-ns");
          expect(ctx.serverPort).toBeGreaterThan(0);
          const timings: ServerReadyTimings = ctx.timings;
          expect(timings.healthAttempts).toBeGreaterThanOrEqual(1);
          hookSawHealthy = true;
        },
      }
    );
    try {
      const res = await fetch(`http://${ORCHESTRATOR_HOST}:${handle.serverPort}${SERVER_HEALTH_PATH}`);
      expect(res.status).toBe(200);
      expect(hookSawHealthy).toBe(true);
      expect(existsSync(handle.paths.serverPortFile)).toBe(true);
      expect(readFileSync(handle.paths.serverPortFile, "utf-8").trim()).toBe(String(handle.serverPort));
      expect(existsSync(handle.paths.serverPidFile)).toBe(true);
      expect(existsSync(handle.paths.identityFile)).toBe(true);
    } finally {
      await expect(handle.shutdown()).resolves.toBe(0);
    }
  }, 30_000);

  it("passes HOST/PORT through and spawns from an explicit no-shell argv", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const envProbeScript = `
const http = require("http");
console.log("HOST=" + process.env["HOST"] + " PORT=" + process.env["PORT"]);
console.log("PORTFILE=" + process.env["${SERVER_PORT_FILE_ENV}"]);
console.log("RUNID=" + process.env["${DEV_RUN_ID_ENV}"]);
http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200); res.end("{}"); }
  else { res.writeHead(404); res.end(); }
}).listen(Number(process.env["PORT"]), process.env["HOST"] || "127.0.0.1");
`;
    const seenArgv: string[][] = [];
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "passthru-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: (ctx: ServerSpawnContext) => {
          expect(ctx.port).toBeGreaterThan(0);
          expect(ctx.host).toBe(ORCHESTRATOR_HOST);
          expect(ctx.portFile.endsWith("server.port")).toBe(true);
          const request: ServerSpawnRequest = { executable: process.execPath, argv: ["-e", envProbeScript] };
          seenArgv.push(request.argv);
          return request;
        },
      }
    );
    try {
      expect(seenArgv).toHaveLength(1);
      // Explicit no-shell argv: the exact executable + argument array reach
      // the child (the fixture script itself legitimately contains `||`,
      // so assert structural passthrough rather than script text).
      expect(seenArgv[0]).toEqual(["-e", envProbeScript]);
      const logContent = readFileSync(handle.paths.serverLogFile, "utf-8");
      expect(logContent).toContain(`HOST=127.0.0.1 PORT=${handle.serverPort}`);
      expect(logContent).toContain(`PORTFILE=${handle.paths.serverPortFile}`);
      expect(logContent).toMatch(/^RUNID=\S+$/m);
    } finally {
      await handle.shutdown();
    }
  }, 30_000);

  it("surfaces the log tail, stops startup, and leaves no owned state when the backend crashes", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "crash-ns");
    const failure = await startBackendPhase(
      { root, argv: ["--namespace", "crash-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", CRASHING_SCRIPT] }),
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    const message = failure instanceof Error ? failure.message : String(failure);
    expect(message).toContain("fatal-boot-error");
    expect(message).toContain("line-100");
    const tail = await readLogTail(paths.serverLogFile);
    expect(tail).toHaveLength(80);
    expect(tail).toContain("line-100");
    expect(tail.join("\n")).toContain("fatal-boot-error");
    expect(existsSync(paths.serverPortFile)).toBe(false);
    expect(existsSync(paths.serverPidFile)).toBe(false);
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 30_000);

  it("times out with exit 3, the tail, and no owned state when health never passes", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "hang-ns");
    const code = await runBackendCommand(
      { root, argv: ["--namespace", "hang-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        serverDeadlineMs: 800,
        pollIntervalMs: 100,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", NEVER_LISTENING_SCRIPT] }),
      }
    );
    expect(code).toBe(3);
    expect(existsSync(paths.serverPortFile)).toBe(false);
    expect(existsSync(paths.serverPidFile)).toBe(false);
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 30_000);

  it("recovers stale residue by identity and never signals a dead PID", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "stale-ns");
    const stale: RunIdentity = {
      runId: "run-stale",
      namespace: "stale-ns",
      orchestratorPid: 2_147_483_646,
      orchestratorStartTimeMs: 1,
      children: { server: { pid: 2_147_483_645, startTimeMs: 2 } },
      createdAt: new Date().toISOString(),
    };
    await writeIdentity(paths.identityFile, stale);
    const nestedResidue = join(root, "apps", "server", ".tmp", "ports", "server.port");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(root, "apps", "server", ".tmp", "ports"), { recursive: true });
    writeFileSync(nestedResidue, "9999", "utf-8");
    // Liveness *checks* are the verification mechanism (not signals): the
    // run must consult identity, find both PIDs stale, and recover by
    // removal. Signaling is covered at the teardown seam (ticket 02: a
    // foreign PID is never passed to the kill path).
    // The fake reports the planted PIDs as stale but delegates every other
    // PID to the real OS checker, so shutdown() genuinely stops the fixture
    // child (an always-false fake would make teardown skip the kill and
    // Windows would refuse to release the temp dir: EPERM).
    const checked: number[] = [];
    const osLive = createOsPidLivenessChecker();
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "stale-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: healthySpawn,
        isPidLive: (pid: number, startTimeMs: number) => {
          checked.push(pid);
          if (pid === 2_147_483_646 || pid === 2_147_483_645) return false;
          return osLive(pid, startTimeMs);
        },
      }
    );
    try {
      expect(checked).toContain(2_147_483_646);
      expect(existsSync(nestedResidue)).toBe(false);
      expect(existsSync(paths.identityFile)).toBe(true);
      const fresh = readFileSync(paths.identityFile, "utf-8");
      expect(fresh).not.toContain("run-stale");
    } finally {
      await handle.shutdown();
    }
  }, 30_000);

  it("fails fast naming the occupant when the namespace is already live", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "busy-ns");
    const ownStart = Date.now() - process.uptime() * 1000;
    const live: RunIdentity = {
      runId: "run-live",
      namespace: "busy-ns",
      orchestratorPid: process.pid,
      orchestratorStartTimeMs: ownStart,
      children: {},
      createdAt: new Date().toISOString(),
    };
    await writeIdentity(paths.identityFile, live);
    let spawned = false;
    const failure = await startBackendPhase(
      { root, argv: ["--namespace", "busy-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => {
          spawned = true;
          return healthySpawn();
        },
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    const message = failure instanceof Error ? failure.message : String(failure);
    expect(message).toContain("busy-ns");
    expect(message).toContain(String(process.pid));
    expect(spawned).toBe(false);
  }, 30_000);

  it("tears down the owned child and records on interrupt shutdown (reverse order, owned only)", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const handlers = new Map<string, () => void>();
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "int-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: healthySpawn,
        onSignal: (signal: string, handler: () => void) => {
          handlers.set(signal, handler);
        },
      }
    );
    expect(handlers.has("SIGINT")).toBe(true);
    expect(handlers.has("SIGTERM")).toBe(true);
    const childPid = handle.serverChild.pid;
    expect(childPid).toBeGreaterThan(0);
    handlers.get("SIGINT")?.();
    const code = await handle.waitForExit();
    expect(code).toBe(0);
    await expect(handle.shutdown()).resolves.toBe(0);
    expect(existsSync(handle.paths.serverPortFile)).toBe(false);
    expect(existsSync(handle.paths.identityFile)).toBe(false);
    expect(parseNamespace(handle.namespace)).toBe("int-ns");
  }, 30_000);

  it("registers shutdown handlers before any run record is observable during the health gate", async () => {
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "gate-signal-ns");
    const handlers = new Map<string, () => void>();
    const runPromise = runBackendCommand(
      { root, argv: ["--namespace", "gate-signal-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({
          executable: process.execPath,
          argv: ["-e", NEVER_LISTENING_SCRIPT],
        }),
        // The gate never passes on its own: the run sits inside the server
        // health window with its records already written.
        probeHealth: () => Promise.resolve(false),
        serverDeadlineMs: 3_000,
        pollIntervalMs: 100,
        onSignal: (signal: string, handler: () => void) => {
          handlers.set(signal, handler);
        },
      }
    );
    try {
      const deadline = Date.now() + 30_000;
      while (!existsSync(paths.identityFile) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(existsSync(paths.identityFile)).toBe(true);
      // The record is observable; a signal at this instant must not be lost.
      expect(handlers.has("SIGINT")).toBe(true);
      expect(handlers.has("SIGTERM")).toBe(true);
      handlers.get("SIGINT")?.();
      await expect(runPromise).resolves.toBe(0);
      expect(lines.join("\n")).not.toContain("run failed");
      expect(existsSync(paths.identityFile)).toBe(false);
      expect(existsSync(paths.serverPidFile)).toBe(false);
    } finally {
      handlers.get("SIGINT")?.();
      await runPromise;
    }
  }, 60_000);

  // RED (round-2 P11): the run record must be claimed exclusively before the
  // freshness builds; busy means the recorded orchestrator is live, children
  // liveness never decides ownership; unverifiable start times never read as
  // "dead" for ownership.
  describe("round-2 P11: exclusive orchestrator-scoped namespace ownership", () => {
    const DEAD_PID = 2_147_483_500;
    const OWN_START = Date.now() - process.uptime() * 1000;

    function fakeSpawn(
      exitListeners: Array<(...args: unknown[]) => void>
    ): SpawnFn {
      return () => ({
        pid: DEAD_PID,
        on: (event: string, listener: (...args: unknown[]) => void) => {
          if (event === "exit") exitListeners.push(listener);
        },
      });
    }

    it("keeps ownership when the PID exists but its start time cannot be read", async () => {
      const execFile = () => Promise.reject(new Error("powershell timed out"));
      const ownership = createOsPidOwnershipChecker({
        platform: "win32",
        pidExists: () => true,
        execFile,
      });
      await expect(ownership(4242, 1000)).resolves.toBe(true);
      // Signal-safety stays strict: the same state is never treated as an
      // identity-verified live PID.
      const strict = createOsPidLivenessChecker({
        platform: "win32",
        pidExists: () => true,
        execFile,
      });
      await expect(strict(4242, 1000)).resolves.toBe(false);
    }, 30_000);

    it("treats a verifiable start-time match as owning and a mismatch as PID reuse", async () => {
      const owning = createOsPidOwnershipChecker({
        platform: "win32",
        pidExists: () => true,
        execFile: () => Promise.resolve({ stdout: "1970-01-01T00:00:10.000Z\n" }),
      });
      await expect(owning(4242, 10_000)).resolves.toBe(true);
      await expect(owning(4242, 999_999)).resolves.toBe(false);
    }, 30_000);

    it("reads POSIX start times locale-proof and falls back to /proc on Linux", async () => {
      const calls: Array<{ command: string; env: Record<string, string> | undefined }> = [];
      const parsed = await getProcessStartTimeMs(4242, {
        platform: "linux",
        execFile: (command: string, _args: string[], env?: Record<string, string>) => {
          calls.push({ command, env });
          return Promise.resolve({ stdout: "Thu Jan  1 00:00:10 1970\n" });
        },
      });
      expect(parsed).toBe(Date.parse("Thu Jan  1 00:00:10 1970"));
      expect(calls[0]?.command).toBe("ps");
      expect(calls[0]?.env?.["LC_ALL"]).toBe("C");

      // ps unavailable: /proc/<pid>/stat field 22 (starttime, clock ticks
      // since boot) reconstructs the start time.
      const ticks = Math.round(osUptime() * 100);
      const zeros = Array.from({ length: 18 }, () => "0").join(" ");
      const viaProc = await getProcessStartTimeMs(4242, {
        platform: "linux",
        execFile: () => Promise.reject(new Error("ps missing")),
        readFile: () => Promise.resolve(`4242 (node) S ${zeros} ${ticks} 0 0\n`),
      });
      expect(viaProc).not.toBeNull();
      expect(Math.abs((viaProc as number) - Date.now())).toBeLessThan(5000);
    }, 30_000);

    it("claims the run record before freshness so a concurrent start fails busy", async () => {
      const root = makeTempRoot();
      const { logLine } = silentLogs();
      const paths = resolveRunPaths(root, "race-ns");
      let releaseBuild: () => void = () => undefined;
      const buildGate = new Promise<void>((resolve) => {
        releaseBuild = resolve;
      });
      let buildEntered = false;
      const exitListeners: Array<(...args: unknown[]) => void> = [];
      const aPromise = startBackendPhase(
        { root, argv: ["--namespace", "race-ns"], env: {} },
        {
          logLine,
          randomRunId: () => "run-a",
          runBuild: async () => {
            buildEntered = true;
            await buildGate;
          },
          createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
          spawnFn: fakeSpawn(exitListeners),
          probeHealth: () => Promise.resolve(true),
        }
      );
      let handle: Awaited<typeof aPromise> | null = null;
      try {
        const deadline = Date.now() + 10_000;
        while (!existsSync(paths.identityFile) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        // The claim exists while the first run is still inside freshness.
        expect(existsSync(paths.identityFile)).toBe(true);
        expect(buildEntered).toBe(true);

        let bBuildEntered = false;
        const failure = await startBackendPhase(
          { root, argv: ["--namespace", "race-ns"], env: {} },
          {
            logLine,
            randomRunId: () => "run-b",
            runBuild: () => {
              bBuildEntered = true;
            },
            createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
            spawnFn: fakeSpawn([]),
            probeHealth: () => Promise.resolve(true),
          }
        ).then(
          () => null,
          (error: unknown) => error
        );
        expect(failure).not.toBeNull();
        const message = failure instanceof Error ? failure.message : String(failure);
        expect(message).toContain("race-ns");
        // The loser never reaches its freshness builds, and the winner's
        // claim survives untouched.
        expect(bBuildEntered).toBe(false);
        const claimed = await readIdentity(paths.identityFile);
        expect(claimed?.runId).toBe("run-a");
      } finally {
        releaseBuild();
        if (handle === null) {
          handle = await aPromise.catch(() => null);
        }
        if (handle !== null) {
          const shutdownPromise = handle.shutdown();
          for (const listener of exitListeners) listener(0, null);
          await shutdownPromise;
        }
      }
    }, 60_000);

    it("stays busy for a live orchestrator whose recorded children are already dead", async () => {
      const root = makeTempRoot();
      const { logLine } = silentLogs();
      const paths = resolveRunPaths(root, "overlap-ns");
      const planted: RunIdentity = {
        runId: "run-first",
        namespace: "overlap-ns",
        orchestratorPid: process.pid,
        orchestratorStartTimeMs: OWN_START,
        children: { server: { pid: DEAD_PID, startTimeMs: 1 } },
        createdAt: new Date().toISOString(),
      };
      await writeIdentity(paths.identityFile, planted);
      let bBuildEntered = false;
      const failure = await startBackendPhase(
        { root, argv: ["--namespace", "overlap-ns"], env: {} },
        {
          logLine,
          runBuild: () => {
            bBuildEntered = true;
          },
          createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", ""] }),
          spawnFn: fakeSpawn([]),
          probeHealth: () => Promise.resolve(true),
        }
      ).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).not.toBeNull();
      const message = failure instanceof Error ? failure.message : String(failure);
      expect(message).toContain("overlap-ns");
      expect(message).toContain("run-first");
      expect(bBuildEntered).toBe(false);
      const untouched = await readIdentity(paths.identityFile);
      expect(untouched?.runId).toBe("run-first");
    }, 60_000);
  });

  // RED (round-2 P14): a failed identity/PID write after spawn must not
  // orphan the server child.
  describe("round-2 P14: post-spawn record writes never orphan the server child", () => {
    it("rejects before spawning when identity.json is a directory", async () => {
      const root = makeTempRoot();
      const { logLine } = silentLogs();
      const paths = resolveRunPaths(root, "id-dir-ns");
      mkdirSync(paths.identityFile, { recursive: true });
      let spawned = false;
      const failure = await startBackendPhase(
        { root, argv: ["--namespace", "id-dir-ns"], env: {} },
        {
          logLine,
          runBuild: () => undefined,
          createServerSpawn: () => {
            spawned = true;
            return healthySpawn();
          },
          spawnFn: () => ({ pid: 2_147_483_500, on: () => undefined }),
          probeHealth: () => Promise.resolve(true),
        }
      ).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).not.toBeNull();
      // The claim precedes the freshness builds and the spawn, so a
      // failed claim leaves no child behind at all.
      expect(spawned).toBe(false);
    }, 30_000);

    it("tears down the just-spawned server when the PID write fails", async () => {
      const root = makeTempRoot();
      const { logLine } = silentLogs();
      const paths = resolveRunPaths(root, "pid-dir-ns");
      mkdirSync(paths.serverPidFile, { recursive: true });
      let childPid = 0;
      const captureSpawn: SpawnFn = (executable, argv, options) => {
        const child = nodeSpawn(executable, argv, {
          shell: false,
          cwd: options.cwd,
          env: options.env as NodeJS.ProcessEnv | undefined,
          stdio: "pipe",
          detached: options.detached,
        });
        childPid = child.pid ?? 0;
        return {
          pid: child.pid,
          on: (event: string, listener: (...args: unknown[]) => void) => {
            child.on(event, listener);
          },
        };
      };
      try {
        const code = await runBackendCommand(
          { root, argv: ["--namespace", "pid-dir-ns"], env: {} },
          {
            logLine,
            runBuild: () => undefined,
            createServerSpawn: healthySpawn,
            spawnFn: captureSpawn,
            isPidLive: (pid: number) => defaultPidExists(pid),
            probeHealth: () => Promise.resolve(true),
          }
        );
        expect(code).toBe(1);
        expect(childPid).toBeGreaterThan(0);
        await new Promise((resolve) => setTimeout(resolve, 300));
        // The failed phase must have stopped the child instead of leaving
        // it running unreferenced.
        expect(() => process.kill(childPid, 0)).toThrow();
        expect(existsSync(paths.identityFile)).toBe(false);
      } finally {
        if (childPid > 0) {
          try {
            process.kill(childPid);
          } catch {
            // Already reaped by the protected teardown.
          }
        }
      }
    }, 60_000);
  });

  it("boots the real server from source with the orchestrator port-file contract", async () => {
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const serverPort = await getPort();
    const handle = await startBackendPhase(
      { root, argv: ["--namespace", "real-ns", "--server-port", String(serverPort)], env: {} },
      {
        logLine,
        // Freshness rebuilds are covered with fakes above; the real `pnpm`
        // build is a Windows-shell concern, not this test's seam.
        runBuild: () => undefined,
      }
    );
    try {
      expect(handle.serverPort).toBe(serverPort);
      const res = await fetch(`http://127.0.0.1:${serverPort}/healthz`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body).toEqual({ status: "ok" });
      expect(readFileSync(handle.paths.serverPortFile, "utf-8").trim()).toBe(String(serverPort));
    } finally {
      await handle.shutdown();
    }
  }, 120_000);
});
