import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import getPort from "get-port";
import { parseNamespace } from "../src/args.js";
import { resolveRunPaths } from "../src/paths.js";
import { spawnChild } from "../src/spawn.js";
import type { SpawnFn } from "../src/spawn.js";
import { readLogTail } from "../src/logs.js";
import { writeIdentity } from "../src/identity.js";
import type { RunIdentity } from "../src/identity.js";
import { getProcessStartTimeMs, createOsPidLivenessChecker } from "../src/process-start-time.js";
import { serverCompiledDeps, ensureServerFreshness } from "../src/freshness.js";
import { resolveE2EBaseUrl, resolveE2EWebPort } from "../src/e2e-ports.js";
import { startBackendPhase, runBackendCommand } from "../src/composer.js";
import {
  DEV_RUN_ID_ENV,
  ORCHESTRATOR_HOST,
  SERVER_HEALTH_PATH,
  SERVER_PORT_FILE_ENV,
  SERVER_PORT_FILE_ENV_ALIAS,
  nestedServerPortResidue,
} from "../src/composer.js";
import type {
  ServerReadyContext,
  ServerReadyTimings,
  ServerSpawnContext,
  ServerSpawnRequest,
} from "../src/composer.js";
import { PROCESS_START_TIME_TOLERANCE_MS } from "../src/process-start-time.js";
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

describe("ticket 03: freshness gates for server-consumed compiled outputs", () => {
  it("inventories exactly the workspace deps the server consumes as compiled output", () => {
    const root = makeTempRoot();
    const names = serverCompiledDeps(root).map((dep) => dep.name);
    expect(names).toEqual([
      "@notebook/contracts",
      "@notebook/logger",
      "@notebook/domain-ops",
      "@notebook/domain-account",
      "@notebook/domain-notebooks",
      "@notebook/infra-db",
      "@notebook/infra-doc-worker",
    ]);
    expect(names).not.toContain("@notebook/ui");
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
    expect(built).toHaveLength(7);
    expect(result.rebuilt).toHaveLength(7);
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
    expect(result.skipped).toHaveLength(6);
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

  it("keeps explicit PLAYWRIGHT base URLs first and builds from the resolved port otherwise", () => {
    const explicit = resolveE2EBaseUrl("/repo", { PLAYWRIGHT_TEST_BASE_URL: "http://example.invalid:9999" }, {
      exists: () => false,
      readFile: () => "",
    });
    expect(explicit).toBe("http://example.invalid:9999");
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
