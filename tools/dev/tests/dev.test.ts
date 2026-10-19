import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import getPort from "get-port";
import { parseOrchestratorArgs } from "../src/args.js";
import { parseNamespace } from "../src/args.js";
import { resolveRunPaths } from "../src/paths.js";
import {
  parsePortInput,
  checkPortAvailable,
  allocateRunPorts,
  formatPortConflictError,
  describePortOccupant,
  OrchestratorError,
} from "../src/ports.js";

import { spawnChild, KNOWN_EXECUTABLES } from "../src/spawn.js";
import type { SpawnFnChild } from "../src/spawn.js";
import type { ChildExit, SpawnFn, SpawnFnOptions } from "../src/spawn.js";
import type { ChildIdentity } from "../src/identity.js";
import {
  ALLOWLISTED_STARTUP_FIELDS,
  LOG_TAIL_LINES,
  createServiceLogTee,
  formatLogLine,
  formatStartupLine,
  readLogTail,
  rotateNamespaceLogs,
  toSafeStartupRecord,
} from "../src/logs.js";
import {
  POLL_INTERVAL_MS,
  SIDECAR_DEADLINE_MS,
  SERVER_HEALTH_DEADLINE_MS,
  TEARDOWN_GRACE_MS,
  defaultTimeoutExitCode,
  waitForReadiness,
} from "../src/readiness.js";
import {
  createPidLivenessChecker,
  currentProcessStartTimeMs,
  isDefaultPidExists,
  isIdentityLive,
  parseIdentity,
  readIdentity,
  writeIdentity,
} from "../src/identity.js";
import type { RunIdentity } from "../src/identity.js";
import { buildForceKillCommand, teardownOwnedRun } from "../src/cleanup.js";
import { resolveGeneratedPathsForRun } from "../src/isolate.js";
import { getProcessStartTimeMs } from "../src/process-start-time.js";
import { makeTempRoot as createTempRoot, removeTempRoots } from "./temp-dir.js";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  return createTempRoot(tempRoots, "notebench-unit-");
}

afterEach(() => removeTempRoots(tempRoots), 120_000);

function identityRecord(runId: string, namespace: string): RunIdentity {
  return {
    runId,
    namespace,
    orchestratorPid: 4711,
    orchestratorStartTimeMs: 1,
    children: {},
    createdAt: new Date().toISOString(),
  };
}

function makeFakeChild(pid: number): SpawnFnChild & {
  fireExit: (code: number | null, signal: string | null) => void;
  fireError: (error: unknown) => void;
} {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    pid,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    },
    fireExit: (code: number | null, signal: string | null) => {
      const cb = listeners.get("exit");
      if (cb !== undefined) cb(code, signal);
    },
    fireError: (error: unknown) => {
      const cb = listeners.get("error");
      // Node's ChildProcess EventEmitter throws on an unhandled 'error'
      // event: this fake reproduces exactly that P6 crash.
      if (cb === undefined) throw error;
      cb(error);
    },
  };
}

function ownedPaths(ns: string): {
  serverPortFile: string;
  webPortFile: string;
  serverPidFile: string;
  webPidFile: string;
  identityFile: string;
} {
  const p = resolveRunPaths(process.cwd(), ns);
  return {
    serverPortFile: p.serverPortFile,
    webPortFile: p.webPortFile,
    serverPidFile: p.serverPidFile,
    webPidFile: p.webPidFile,
    identityFile: p.identityFile,
  };
}

const fakeSpawn: SpawnFn = (_executable, _argv, _options) => ({ pid: 9, on: () => {} });

function freePort(): Promise<number> {
  return getPort();
}

function occupyPort(port: number): Promise<net.Server> {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { resolve(server); });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => { resolve(); }));
}

describe("ticket 01: orchestrator args, paths, ports", () => {
  describe("CLI/env precedence (flag > NOTEBENCH_* > NB_* > default)", () => {
    it("returns defaults with no flags and empty env", () => {
      expect(parseOrchestratorArgs([], {})).toEqual({
        namespace: "default",
        serverPort: undefined,
        webPort: undefined,
        warmup: "route",
      });
    });

    it("accepts --namespace/--server-port/--web-port/--warmup flags", () => {
      expect(
        parseOrchestratorArgs(
          ["--namespace", "team-a", "--server-port", "4123", "--web-port", "3123", "--warmup", "ui"],
          {}
        )
      ).toEqual({ namespace: "team-a", serverPort: 4123, webPort: 3123, warmup: "ui" });
    });

    it("accepts --flag=value form", () => {
      expect(
        parseOrchestratorArgs(["--namespace=team-b", "--server-port=4200", "--web-port=3200"], {})
      ).toEqual({ namespace: "team-b", serverPort: 4200, webPort: 3200, warmup: "route" });
    });

    it("reads canonical NOTEBENCH_* env when no flag is given", () => {
      expect(
        parseOrchestratorArgs([], {
          NOTEBENCH_NAMESPACE: "from-env",
          NOTEBENCH_SERVER_PORT: "4111",
          NOTEBENCH_WEB_PORT: "3111",
        })
      ).toEqual({ namespace: "from-env", serverPort: 4111, webPort: 3111, warmup: "route" });
    });

    it("falls back to NB_* alias when canonical is absent", () => {
      expect(
        parseOrchestratorArgs([], {
          NB_NAMESPACE: "alias-ns",
          NB_SERVER_PORT: "4222",
          NB_WEB_PORT: "3222",
        })
      ).toEqual({ namespace: "alias-ns", serverPort: 4222, webPort: 3222, warmup: "route" });
    });

    it("prefers flag over canonical over alias", () => {
      const env = { NOTEBENCH_NAMESPACE: "canon", NB_NAMESPACE: "alias" };
      expect(parseOrchestratorArgs(["--namespace", "flag"], env).namespace).toBe("flag");
      expect(parseOrchestratorArgs([], env).namespace).toBe("canon");
    });

    it("ignores upstream (OpenDesign) env names entirely", () => {
      expect(
        parseOrchestratorArgs([], {
          OD_NAMESPACE: "upstream",
          OPEN_DESIGN_NAMESPACE: "upstream",
          OPENDESIGN_SERVER_PORT: "9999",
        })
      ).toEqual({ namespace: "default", serverPort: undefined, webPort: undefined, warmup: "route" });
    });

    it("rejects unknown flags and invalid warmup values", () => {
      expect(() => parseOrchestratorArgs(["--no-web"], {})).toThrow(OrchestratorError);
      expect(() => parseOrchestratorArgs(["--warmup", "turbo"], {})).toThrow(OrchestratorError);
      expect(() => parseOrchestratorArgs(["--namespace"], {})).toThrow(OrchestratorError);
    });
  });

  describe("namespace allowlist", () => {
    it.each(["default", "a", "team-1", "a_b", "ns9", "AbC-1_x"])("accepts %s", (ns) => {
      expect(parseNamespace(ns)).toBe(ns.toLowerCase());
    });

    it("case-normalizes so Dev and dev can never alias one directory (P25)", () => {
      expect(parseNamespace("Dev")).toBe("dev");
      expect(parseNamespace("DEV-1")).toBe("dev-1");
      expect(parseNamespace("aB_cD")).toBe("ab_cd");
      const upper = resolveRunPaths(process.cwd(), "Dev");
      const lower = resolveRunPaths(process.cwd(), "dev");
      expect(upper.portsDir).toBe(lower.portsDir);
      expect(upper.serverLogFile).toBe(lower.serverLogFile);
      expect(upper.identityFile).toBe(lower.identityFile);
    });

    it.each(["", "..", "../x", "a/b", String.raw`a\b`, ".hidden", "-lead", "_lead", "a b", "a.b", "a:b"])(
      "rejects %s",
      (ns) => {
        expect(() => parseNamespace(ns)).toThrow(OrchestratorError);
      }
    );

    it("rejects overlong namespaces", () => {
      expect(() => parseNamespace("a".repeat(33))).toThrow(OrchestratorError);
      expect(parseNamespace("a".repeat(32))).toBe("a".repeat(32));
    });

    it("rejects non-string namespaces", () => {
      expect(() => parseNamespace(undefined)).toThrow(OrchestratorError);
      expect(() => parseNamespace(42)).toThrow(OrchestratorError);
    });
  });

  describe("run paths stay under the workspace disposable root", () => {
    it("resolves the documented namespaced layout", () => {
      const p = resolveRunPaths(process.cwd(), "default");
      const tmp = path.join(process.cwd(), ".tmp");
      expect(p.portsDir).toBe(path.join(tmp, "ports", "default"));
      expect(p.serverPortFile).toBe(path.join(tmp, "ports", "default", "server.port"));
      expect(p.webPortFile).toBe(path.join(tmp, "ports", "default", "web.port"));
      expect(p.serverPidFile).toBe(path.join(tmp, "pids", "default", "server.pid"));
      expect(p.webPidFile).toBe(path.join(tmp, "pids", "default", "web.pid"));
      expect(p.devLogFile).toBe(path.join(tmp, "logs", "dev", "default", "latest.log"));
      expect(p.serverLogFile).toBe(path.join(tmp, "logs", "server", "default", "latest.log"));
      expect(p.webLogFile).toBe(path.join(tmp, "logs", "web", "default", "latest.log"));
      expect(p.buildDir).toBe(path.join(tmp, "build", "default"));
      expect(p.identityFile).toBe(path.join(tmp, "run", "default", "identity.json"));
    });

    it("keeps every path inside the workspace .tmp root", () => {
      const cwd = process.cwd();
      const p = resolveRunPaths(cwd, "team-a");
      const prefix = path.join(cwd, ".tmp") + path.sep;
      for (const file of Object.values(p.files)) {
        expect(file.startsWith(prefix)).toBe(true);
      }
    });

    it("rejects traversal namespaces and non-absolute roots", () => {
      expect(() => resolveRunPaths(process.cwd(), "../escape")).toThrow(OrchestratorError);
      expect(() => resolveRunPaths("relative/root", "default")).toThrow(OrchestratorError);
    });

    it("resolves disjoint state for two namespaces", () => {
      const a = resolveRunPaths(process.cwd(), "alpha");
      const b = resolveRunPaths(process.cwd(), "beta");
      const filesA = new Set(Object.values(a.files));
      for (const file of Object.values(b.files)) {
        expect(filesA.has(file)).toBe(false);
      }
    });
  });

  describe("port validation and allocation", () => {
    it.each(["1", "80", "3000", "65535"])("accepts %s", (raw) => {
      expect(parsePortInput(raw, "test")).toBe(Number(raw));
    });

    it.each(["0", "-1", "65536", "99999", "", "abc", "12.5", "0x50", "  ", "3_000"])(
      "rejects %s as user-facing input (0 means auto internally, never a default)",
      (raw) => {
        expect(() => parsePortInput(raw, "test")).toThrow(OrchestratorError);
      }
    );

    it("probes availability directly", async () => {
      const port = await freePort();
      await expect(checkPortAvailable(port, "127.0.0.1")).resolves.toBe(true);
      const occupant = await occupyPort(port);
      try {
        await expect(checkPortAvailable(port, "127.0.0.1")).resolves.toBe(false);
      } finally {
        await closeServer(occupant);
      }
    });

    it("allocates two distinct valid ports with no force flags", async () => {
      const ports = await allocateRunPorts({});
      expect(ports.serverPort).toBeGreaterThanOrEqual(1);
      expect(ports.serverPort).toBeLessThanOrEqual(65_535);
      expect(ports.webPort).toBeGreaterThanOrEqual(1);
      expect(ports.webPort).toBeLessThanOrEqual(65_535);
      expect(ports.webPort).not.toBe(ports.serverPort);
    });

    it("honors a free forced port exactly", async () => {
      const forced = await freePort();
      const ports = await allocateRunPorts({ serverPort: forced });
      expect(ports.serverPort).toBe(forced);
      expect(ports.webPort).not.toBe(forced);
    });

    it("fails fast with exit code 2 naming port and service on forced conflict", async () => {
      const taken = await freePort();
      const occupant = await occupyPort(taken);
      try {
        let err: unknown = null;
        try {
          await allocateRunPorts({ serverPort: taken });
        } catch (error: unknown) {
          err = error;
        }
        expect(err).toBeInstanceOf(OrchestratorError);
        const oerr = err as OrchestratorError;
        expect(oerr.exitCode).toBe(2);
        expect(oerr.message).toContain(String(taken));
        expect(oerr.message).toContain("server");
      } finally {
        await closeServer(occupant);
      }
    });

    it("rejects the same forced port for both services", async () => {
      const forced = await freePort();
      let err: unknown = null;
      try {
        await allocateRunPorts({ serverPort: forced, webPort: forced });
      } catch (error: unknown) {
        err = error;
      }
      expect(err).toBeInstanceOf(OrchestratorError);
      expect((err as OrchestratorError).exitCode).toBe(2);
    });

    it("enforces the reserved set after auto allocation, retrying past a collision (P28)", async () => {
      const forced = await freePort();
      const fallback = await freePort();
      const exclusions: number[][] = [];
      const ports = await allocateRunPorts(
        { serverPort: forced },
        {
          getPortFn: async (options) => {
            exclusions.push([...(options?.exclude ?? [])]);
            return exclusions.length === 1 ? forced : fallback;
          },
        }
      );
      expect(ports.serverPort).toBe(forced);
      expect(ports.webPort).toBe(fallback);
      expect(exclusions).toHaveLength(2);
      expect(exclusions[0]).toContain(forced);
    });
  });

  describe("conflict diagnostics", () => {
    it("formats a conflict error with service, port, and occupant", () => {
      const err = formatPortConflictError("web", 3123, "pid 1234 (node.exe)");
      expect(err).toBeInstanceOf(OrchestratorError);
      expect(err.exitCode).toBe(2);
      expect(err.message).toContain("web");
      expect(err.message).toContain("3123");
      expect(err.message).toContain("pid 1234 (node.exe)");
    });

    it("describePortOccupant never throws and returns a string", async () => {
      const closed = await freePort();
      await expect(describePortOccupant(closed, "127.0.0.1")).resolves.toEqual(expect.any(String));
    });
  });

  describe("ticket 02: spawn with known executables and explicit argv", () => {
    it("rejects unknown executables with exit code 1", () => {
      expect(() =>
        spawnChild(
          {
            executable: "curl",
            argv: ["http://example.invalid"],
            service: "server",
            namespace: "default",
            runId: "run-1",
            logFile: "/tmp/x.log",
          },
          { spawnFn: () => makeFakeChild(1) }
        )
      ).toThrow(OrchestratorError);
      try {
        spawnChild(
          {
            executable: "powershell",
            argv: ["-Command", "echo hi"],
            service: "server",
            namespace: "default",
            runId: "run-1",
            logFile: "/tmp/x.log",
          },
          { spawnFn: () => makeFakeChild(1) }
        );
        expect.unreachable("expected OrchestratorError");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(OrchestratorError);
        expect((error as OrchestratorError).exitCode).toBe(1);
      }
    });

    it("spawns with explicit argv, shell:false, and records child metadata", () => {
      const seen: { exe: string; argv: string[]; shell: unknown }[] = [];
      const fake = makeFakeChild(4242);
      const child = spawnChild(
        {
          executable: "node",
          argv: ["--input-type=module", "-e", "console.log(1)"],
          service: "server",
          namespace: "team-a",
          runId: "run-abc",
          logFile: "/tmp/team-a-server.log",
          cwd: process.cwd(),
        },
        {
          now: () => 1_700_000_000_000,
          spawnFn: (exe, argv, options) => {
            seen.push({ exe, argv, shell: options.shell });
            expect(options.shell).toBe(false);
            return fake;
          },
        }
      );
      expect(seen).toHaveLength(1);
      expect(seen[0]?.exe).toBe("node");
      expect(seen[0]?.argv).toEqual(["--input-type=module", "-e", "console.log(1)"]);
      expect(seen[0]?.shell).toBe(false);
      expect(child.pid).toBe(4242);
      expect(child.startTimeMs).toBe(1_700_000_000_000);
      expect(child.service).toBe("server");
      expect(child.namespace).toBe("team-a");
      expect(child.runId).toBe("run-abc");
      expect(child.logFile).toBe("/tmp/team-a-server.log");
      expect(child.executable).toBe("node");
      expect(child.argv).toEqual(["--input-type=module", "-e", "console.log(1)"]);
      expect(KNOWN_EXECUTABLES).toContain("node");
    });

    it("resolves the exit record when the child exits", async () => {
      const fake = makeFakeChild(7777);
      const child = spawnChild(
        {
          executable: "node",
          argv: ["-e", "process.exit(3)"],
          service: "web",
          namespace: "default",
          runId: "run-x",
          logFile: "/tmp/w.log",
        },
        { spawnFn: () => fake }
      );
      fake.fireExit(3, null);
      await expect(child.exited).resolves.toEqual({ code: 3, signal: null });
    });

    it("surfaces a child 'error' as an exit record instead of crashing (P6)", async () => {
      const fake = makeFakeChild(31_337);
      const child = spawnChild(
        {
          executable: "node",
          argv: ["-e", "process.exit(0)"],
          service: "server",
          namespace: "default",
          runId: "run-err",
          logFile: "/tmp/err.log",
        },
        { spawnFn: () => fake }
      );
      fake.fireError(new Error("spawn ENOENT"));
      await expect(child.exited).resolves.toEqual({
        code: null,
        signal: null,
        error: "spawn ENOENT",
      });
    });

    it("keeps the first exit observation when an error arrives later", async () => {
      const fake = makeFakeChild(31_338);
      const child = spawnChild(
        {
          executable: "node",
          argv: ["-e", "process.exit(0)"],
          service: "server",
          namespace: "default",
          runId: "run-late-err",
          logFile: "/tmp/late-err.log",
        },
        { spawnFn: () => fake }
      );
      fake.fireExit(7, null);
      fake.fireError(new Error("late error"));
      await expect(child.exited).resolves.toEqual({ code: 7, signal: null });
    });

    it("decodes multi-byte UTF-8 split across chunk boundaries (P6)", async () => {
      const chunks: string[] = [];
      const child = spawnChild({
        executable: process.execPath,
        argv: [
          "-e",
          "process.stdout.write(Buffer.from([0xc3])); " +
            "setTimeout(() => process.stdout.write(Buffer.from([0xa9])), 30)",
        ],
        service: "web",
        namespace: "default",
        runId: "run-utf8",
        logFile: "/tmp/utf8.log",
        onOutput: (_stream, chunk) => {
          chunks.push(chunk);
        },
      });
      const exit = await child.exited;
      expect(exit.code).toBe(0);
      expect(chunks.join("")).toBe("é");
    }, 20_000);

    it("a failed spawn cannot crash the orchestrator with an unhandled 'error' (P6)", async () => {
      const missingCwd = path.join(makeTempRoot(), "missing-cwd");
      expect(() =>
        spawnChild({
          executable: process.execPath,
          argv: ["-e", "0"],
          service: "server",
          namespace: "default",
          runId: "run-crash",
          logFile: "/tmp/crash.log",
          cwd: missingCwd,
        })
      ).toThrow(OrchestratorError);
      // A failed spawn emits 'error' asynchronously: without a subscription
      // this is the window where the orchestrator dies (P6).
      await new Promise((resolve) => setTimeout(resolve, 150));
    }, 20_000);

    it("keeps a chatty child without onOutput from deadlocking on a full pipe (P17)", async () => {
      const child = spawnChild({
        executable: process.execPath,
        argv: [
          "-e",
          "process.stdout.write('x'.repeat(1024 * 1024)); " +
            "process.stdout.write('y'.repeat(1024 * 1024))",
        ],
        service: "server",
        namespace: "default",
        runId: "run-chatty",
        logFile: "/tmp/chatty.log",
      });
      try {
        let timer: NodeJS.Timeout | undefined;
        const exit = await Promise.race([
          child.exited,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => { reject(new Error("chatty child never exited: pipe not drained")); },
              5000
            );
          }),
        ]);
        if (timer !== undefined) clearTimeout(timer);
        expect(exit.code).toBe(0);
      } finally {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {
          // Already reaped by the exit above.
        }
      }
    }, 20_000);

    it("rejects non-string argv entries and shell wrappers", () => {
      expect(() =>
        spawnChild(
          {
            executable: "node -e evil",
            argv: ["-e", "x"],
            service: "server",
            namespace: "default",
            runId: "r",
            logFile: "/tmp/x.log",
          },
          { spawnFn: () => makeFakeChild(1) }
        )
      ).toThrow(OrchestratorError);
    });
  });

  describe("ticket 02: prefixed tee, rotation, allowlisted startup values, tails", () => {
    it("prefixes console tee lines per service", () => {
      expect(formatLogLine("server", "hello")).toBe("[server] hello");
      expect(formatLogLine("web", "hello")).toBe("[web] hello");
      expect(formatLogLine("dev", "hello")).toBe("[dev] hello");
    });

    it("rotates only the current namespace logs, leaving siblings alone", async () => {
      const renamed: { from: string; to: string }[] = [];
      const removed: string[] = [];
      const existing = new Set([
        "/root/.tmp/logs/server/team-a/latest.log",
        "/root/.tmp/logs/server/team-b/latest.log",
      ]);
      const result = await rotateNamespaceLogs(
        {
          latestFile: "/root/.tmp/logs/server/team-a/latest.log",
          previousFile: "/root/.tmp/logs/server/team-a/previous.log",
        },
        {
          exists: (p: string) => existing.has(p),
          rename: (from: string, to: string) => {
            renamed.push({ from, to });
            existing.delete(from);
          },
          remove: (p: string) => {
            removed.push(p);
          },
        }
      );
      expect(result).toBe("rotated");
      expect(renamed).toEqual([
        {
          from: "/root/.tmp/logs/server/team-a/latest.log",
          to: "/root/.tmp/logs/server/team-a/previous.log",
        },
      ]);
      expect(renamed.some((r) => r.from.includes("team-b"))).toBe(false);
      expect(existing.has("/root/.tmp/logs/server/team-b/latest.log")).toBe(true);
      expect(removed).toEqual([]);
    });

    it("reports fresh when no latest log exists", async () => {
      const renamed: unknown[] = [];
      const result = await rotateNamespaceLogs(
        {
          latestFile: "/root/.tmp/logs/web/team-a/latest.log",
          previousFile: "/root/.tmp/logs/web/team-a/previous.log",
        },
        {
          exists: () => false,
          rename: () => {
            renamed.push(1);
          },
        }
      );
      expect(result).toBe("fresh");
      expect(renamed).toEqual([]);
    });

    it("keeps rotation best-effort when the latest log is locked (P23)", async () => {
      const result = await rotateNamespaceLogs(
        {
          latestFile: "/root/.tmp/logs/server/locked/latest.log",
          previousFile: "/root/.tmp/logs/server/locked/previous.log",
        },
        {
          exists: () => true,
          remove: () => {},
          rename: () => {
            throw new Error("EBUSY: resource busy or locked");
          },
        }
      );
      expect(result).toBe("fresh");
    });

    it("keeps rotation best-effort when the stale previous log cannot be removed (P23)", async () => {
      const renamed: string[] = [];
      const result = await rotateNamespaceLogs(
        {
          latestFile: "/root/.tmp/logs/web/stuck/latest.log",
          previousFile: "/root/.tmp/logs/web/stuck/previous.log",
        },
        {
          exists: () => true,
          remove: () => {
            throw new Error("EPERM: operation not permitted");
          },
          rename: (from: string, to: string) => {
            renamed.push(`${from} -> ${to}`);
          },
        }
      );
      expect(result).toBe("fresh");
      expect(renamed).toEqual([]);
    });

    it("drains the residual partial line to the console on flush (P22)", async () => {
      const logFile = path.join(makeTempRoot(), "tee-flush.log");
      const lines: string[] = [];
      const tee = createServiceLogTee({
        logFile,
        service: "web",
        logLine: (line: string) => {
          lines.push(line);
        },
      });
      tee.onOutput("stdout", "boot: compiling");
      await tee.flush();
      expect(lines).toEqual(["[web] boot: compiling"]);
      await expect(readFile(logFile, "utf8")).resolves.toBe("boot: compiling");
    });

    it("bounds carriage-return progress output by emitting each overwrite segment (P22)", async () => {
      const lines: string[] = [];
      const tee = createServiceLogTee({
        logFile: path.join(makeTempRoot(), "tee-progress.log"),
        service: "server",
        logLine: (line: string) => {
          lines.push(line);
        },
      });
      tee.onOutput("stdout", "10%\r50%\r100%\n");
      await tee.flush();
      expect(lines).toEqual(["[server] 10%", "[server] 50%", "[server] 100%"]);
    });

    it("logs only allowlisted startup values and never secrets", () => {
      const line = formatStartupLine("server", {
        namespace: "team-a",
        runId: "run-123",
        serverPort: 4123,
        webPort: 3123,
        NOTEBENCH_API_KEY: "sk-super-secret",
        SECRET_TOKEN: "hunter2",
        VAULT_PASSWORD: "vault-secret",
      });
      expect(line).toContain("[server]");
      expect(line).toContain("team-a");
      expect(line).toContain("4123");
      expect(line).not.toContain("sk-super-secret");
      expect(line).not.toContain("hunter2");
      expect(line).not.toContain("vault-secret");
      expect(line).not.toContain("NOTEBENCH_API_KEY");
    });

    it("exposes the startup allowlist and narrows safe records directly", () => {
      expect(ALLOWLISTED_STARTUP_FIELDS).toContain("namespace");
      expect(ALLOWLISTED_STARTUP_FIELDS).toContain("serverPort");
      expect(ALLOWLISTED_STARTUP_FIELDS).not.toContain("NOTEBENCH_API_KEY");
      expect(toSafeStartupRecord(null)).toEqual({});
      expect(toSafeStartupRecord({ namespace: "a", serverPort: 4123, SECRET: "x" })).toEqual({
        namespace: "a",
        serverPort: "4123",
      });
    });

    it("covers the spawn/identity record types directly", () => {
      const exit: ChildExit = { code: 0, signal: null };
      const kid: ChildIdentity = { pid: 7, startTimeMs: 70 };
      const options: SpawnFnOptions = { shell: false };
      expect(exit.code).toBe(0);
      expect(kid.pid).toBe(7);
      expect(options.shell).toBe(false);
      expect(fakeSpawn("node", [], options).pid).toBe(9);
    });

    it("reads the last 80 log lines on failure", async () => {
      expect(LOG_TAIL_LINES).toBe(80);
      const lines = Array.from({ length: 200 }, (_, i) => `line-${i + 1}`);
      const tail = await readLogTail("/tmp/failing.log", 80, {
        readFile: () => Promise.resolve(lines.join("\n")),
      });
      expect(tail).toHaveLength(80);
      expect(tail[0]).toBe("line-121");
      expect(tail.at(-1)).toBe("line-200");
    });

    it("returns all lines when the log is shorter than the tail", async () => {
      const tail = await readLogTail("/tmp/short.log", 80, {
        readFile: () => Promise.resolve("a\nb"),
      });
      expect(tail).toEqual(["a", "b"]);
    });
  });

  describe("ticket 02: deadline-based readiness with child-exit abort", () => {
    it("uses the spec numeric budgets (120s/35s/150ms/10s)", () => {
      expect(SERVER_HEALTH_DEADLINE_MS).toBe(120_000);
      expect(SIDECAR_DEADLINE_MS).toBe(35_000);
      expect(POLL_INTERVAL_MS).toBe(150);
      expect(TEARDOWN_GRACE_MS).toBe(10_000);
      expect(defaultTimeoutExitCode("server")).toBe(3);
      expect(defaultTimeoutExitCode("web")).toBe(4);
    });

    it("succeeds before the deadline with short-interval polls (no fixed sleeps)", async () => {
      let nowMs = 0;
      const sleeps: number[] = [];
      let probes = 0;
      const result = await waitForReadiness(
        {
          service: "server",
          deadlineMs: 1000,
          intervalMs: 100,
          probe: () => {
            probes += 1;
            return probes >= 3;
          },
          isChildExited: () => false,
          getLogTail: () => [],
        },
        {
          now: () => nowMs,
          sleep: (ms: number) => {
            sleeps.push(ms);
            nowMs += ms;
            return Promise.resolve();
          },
        }
      );
      expect(result.attempts).toBe(3);
      expect(result.elapsedMs).toBe(200);
      expect(sleeps).toEqual([100, 100]);
      expect(sleeps.every((s) => s === 100)).toBe(true);
    });

    it("times out with the service exit code and attaches the log tail", async () => {
      let nowMs = 0;
      try {
        await waitForReadiness(
          {
            service: "server",
            deadlineMs: 300,
            intervalMs: 100,
            probe: () => false,
            isChildExited: () => false,
            getLogTail: () => ["boom-1", "boom-2"],
          },
          {
            now: () => nowMs,
            sleep: (ms: number) => {
              nowMs += ms;
              return Promise.resolve();
            },
          }
        );
        expect.unreachable("expected readiness timeout");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(OrchestratorError);
        const oerr = error as OrchestratorError;
        expect(oerr.exitCode).toBe(3);
        expect(oerr.message).toContain("server");
        expect(oerr.message).toContain("boom-1");
      }
      try {
        await waitForReadiness(
          {
            service: "web",
            deadlineMs: 200,
            intervalMs: 100,
            probe: () => false,
            isChildExited: () => false,
            getLogTail: () => ["web-tail"],
          },
          {
            now: () => nowMs,
            sleep: (ms: number) => {
              nowMs += ms;
              return Promise.resolve();
            },
          }
        );
        expect.unreachable("expected web timeout");
      } catch (error: unknown) {
        expect((error as OrchestratorError).exitCode).toBe(4);
        expect((error as OrchestratorError).message).toContain("web-tail");
      }
    });

    it("aborts immediately when the child exits mid-wait, with the log tail", async () => {
      let nowMs = 0;
      const sleeps: number[] = [];
      let checks = 0;
      try {
        await waitForReadiness(
          {
            service: "server",
            deadlineMs: 60_000,
            intervalMs: 150,
            probe: () => false,
            isChildExited: () => {
              checks += 1;
              return checks >= 2;
            },
            getLogTail: () => ["tail-a", "tail-b"],
          },
          {
            now: () => nowMs,
            sleep: (ms: number) => {
              sleeps.push(ms);
              nowMs += ms;
              return Promise.resolve();
            },
          }
        );
        expect.unreachable("expected child-exit abort");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(OrchestratorError);
        const oerr = error as OrchestratorError;
        expect(oerr.exitCode).toBe(1);
        expect(oerr.message).toContain("server");
        expect(oerr.message).toContain("tail-a");
      }
      expect(nowMs).toBeLessThan(5000);
      expect(sleeps.length).toBeLessThanOrEqual(1);
    });

    it("bounds each probe by the remaining budget and reports actual elapsed (P18)", async () => {
      let calls = 0;
      const startedAt = Date.now();
      let message = "";
      try {
        await waitForReadiness(
          {
            service: "server",
            deadlineMs: 200,
            intervalMs: 10,
            probe: () => {
              calls += 1;
              if (calls === 1) return false;
              return new Promise<boolean>((resolve) => {
                setTimeout(() => { resolve(false); }, 600);
              });
            },
            isChildExited: () => false,
            getLogTail: () => [],
          }
        );
        expect.unreachable("expected readiness timeout");
      } catch (error: unknown) {
        message = (error as OrchestratorError).message;
      }
      const observedMs = Date.now() - startedAt;
      expect(observedMs).toBeLessThan(550);
      const reportedMs = Number(/after (\d+)ms/.exec(message)?.[1] ?? "NaN");
      expect(Number.isFinite(reportedMs)).toBe(true);
      expect(Math.abs(reportedMs - observedMs)).toBeLessThan(150);
    }, 20_000);
  });

  describe("ticket 02: run identity liveness and stale rejection", () => {
    const liveIdentity: RunIdentity = {
      runId: "run-1",
      namespace: "default",
      orchestratorPid: 111,
      orchestratorStartTimeMs: 1000,
      children: {
        server: { pid: 222, startTimeMs: 2000 },
        web: { pid: 333, startTimeMs: 3000 },
      },
      createdAt: "2026-10-14T00:00:00.000Z",
    };

    it("computes the current process start time from clock and uptime", () => {
      expect(currentProcessStartTimeMs(1_700_000_000_000, 12.5)).toBe(1_699_999_987_500);
    });

    it("sees the current process alive and a huge PID dead", () => {
      expect(isDefaultPidExists(process.pid)).toBe(true);
      expect(isDefaultPidExists(2_147_483_647)).toBe(false);
    });

    it("treats a dead PID as stale", async () => {
      const isPidLive = createPidLivenessChecker({
        pidExists: () => false,
        getStartTimeMs: () => 1000,
      });
      expect(await isPidLive(99_999, 1000)).toBe(false);
      await expect(isIdentityLive(liveIdentity, isPidLive)).resolves.toBe(false);
    });

    it("treats a live PID with the wrong start time as stale", async () => {
      const isPidLive = createPidLivenessChecker({
        pidExists: () => true,
        getStartTimeMs: () => 9999,
      });
      expect(await isPidLive(111, 1000)).toBe(false);
      await expect(isIdentityLive(liveIdentity, isPidLive)).resolves.toBe(false);
    });

    it("is live only when every PID exists with a matching start time", async () => {
      const starts = new Map([
        [111, 1000],
        [222, 2000],
        [333, 3000],
      ]);
      const isPidLive = createPidLivenessChecker({
        pidExists: (pid: number) => starts.has(pid),
        getStartTimeMs: (pid: number) => starts.get(pid) ?? null,
      });
      await expect(isIdentityLive(liveIdentity, isPidLive)).resolves.toBe(true);
    });

    it("rejects corrupt identity payloads without throwing", () => {
      expect(parseIdentity(null)).toBeNull();
      expect(parseIdentity({})).toBeNull();
      expect(parseIdentity({ runId: "x" })).toBeNull();
    });

    it("round-trips identity through injected IO", async () => {
      const store = new Map<string, string>();
      await writeIdentity("/run/default/identity.json", liveIdentity, {
        writeFile: (p: string, c: string) => {
          store.set(p, c);
        },
        mkdir: () => {},
      });
      const back = await readIdentity("/run/default/identity.json", {
        readFile: (p: string) => Promise.resolve(store.get(p) ?? ""),
      });
      expect(back).toEqual(liveIdentity);
    });

    it("returns null for missing or corrupt identity files", async () => {
      await expect(
        readIdentity("/run/missing/identity.json", {
          readFile: () => Promise.reject(new Error("ENOENT")),
        })
      ).resolves.toBeNull();
      await expect(
        readIdentity("/run/bad/identity.json", {
          readFile: () => Promise.resolve("not-json{{{"),
        })
      ).resolves.toBeNull();
    });
  });

  describe("ticket 02: owned-only teardown in reverse order", () => {
    it("stops the sibling in reverse order (web before server)", async () => {
      const p = resolveRunPaths(process.cwd(), "teardown-order");
      const order: string[] = [];
      const live = new Set([1001, 1002]);
      await teardownOwnedRun(
        p,
        [
          { service: "server", pid: 1001, startTimeMs: 10 },
          { service: "web", pid: 1002, startTimeMs: 20 },
        ],
        {
          isPidLive: (pid: number) => live.has(pid),
          requestGracefulStop: (child) => {
            order.push(child.service);
            live.delete(child.pid);
          },
          unlink: () => {},
        }
      );
      expect(order).toEqual(["web", "server"]);
    });

    it("force-kills only the owned tree still alive after the bounded grace", async () => {
      const p = resolveRunPaths(process.cwd(), "teardown-grace");
      let nowMs = 0;
      let totalSlept = 0;
      const forced: number[] = [];
      const result = await teardownOwnedRun(
        p,
        [{ service: "server", pid: 2001, startTimeMs: 10 }],
        {
          graceMs: 500,
          pollIntervalMs: 100,
          now: () => nowMs,
          sleep: (ms: number) => {
            totalSlept += ms;
            nowMs += ms;
            return Promise.resolve();
          },
          isPidLive: () => true,
          requestGracefulStop: () => {},
          forceKill: (pid: number) => {
            forced.push(pid);
          },
          unlink: () => {},
        }
      );
      expect(forced).toEqual([2001]);
      expect(result.forceKilled).toEqual(["server"]);
      expect(totalSlept).toBeLessThanOrEqual(1000);
    });

    it("skips force-kill when graceful stop already reaped the child", async () => {
      const p = resolveRunPaths(process.cwd(), "teardown-graceful");
      const forced: number[] = [];
      let isLive = true;
      await teardownOwnedRun(
        p,
        [{ service: "server", pid: 3001, startTimeMs: 10 }],
        {
          graceMs: 500,
          isPidLive: () => isLive,
          requestGracefulStop: () => {
            isLive = false;
          },
          forceKill: (pid: number) => {
            forced.push(pid);
          },
          unlink: () => {},
        }
      );
      expect(forced).toEqual([]);
    });

    it("uses taskkill /T /F on Windows and group-kill on POSIX", () => {
      const win = buildForceKillCommand(4321, "win32");
      expect(win.command).toBe("taskkill");
      expect(win.args).toEqual(["/T", "/F", "/PID", "4321"]);
      const posix = buildForceKillCommand(4321, "linux");
      expect(posix.command).toBe("kill");
      expect(posix.args.join(" ")).toContain("4321");
      expect(posix.args.join(" ").toLowerCase()).toContain("kill");
    });

    it("deletes only this run files and leaves the sibling namespace alone", async () => {
      const mine = resolveRunPaths(process.cwd(), "mine-ns");
      const sibling = resolveRunPaths(process.cwd(), "sibling-ns");
      const unlinked: string[] = [];
      // Both children: run-level teardown removes all five records of the
      // namespace, never the sibling namespace's records.
      await teardownOwnedRun(
        mine,
        [
          { service: "server", pid: 4001, startTimeMs: 10 },
          { service: "web", pid: 4002, startTimeMs: 20 },
        ],
        {
          isPidLive: () => false,
          requestGracefulStop: () => {},
          unlink: (path: string) => {
            unlinked.push(path);
          },
        }
      );
      const owned = ownedPaths("mine-ns");
      for (const file of Object.values(owned)) {
        expect(unlinked).toContain(file);
      }
      const siblingFiles = Object.values(ownedPaths("sibling-ns"));
      for (const file of siblingFiles) {
        expect(unlinked).not.toContain(file);
      }
      expect(sibling.serverPortFile).not.toBe(mine.serverPortFile);
    });

    it("never signals a stale or foreign PID, but still cleans owned files", async () => {
      const p = resolveRunPaths(process.cwd(), "stale-ns");
      const signaled: number[] = [];
      const forced: number[] = [];
      const unlinked: string[] = [];
      const result = await teardownOwnedRun(
        p,
        [{ service: "server", pid: 99_998, startTimeMs: 1234 }],
        {
          isPidLive: () => false,
          requestGracefulStop: () => {
            signaled.push(99_998);
          },
          forceKill: (pid: number) => {
            forced.push(pid);
          },
          unlink: (path: string) => {
            unlinked.push(path);
          },
        }
      );
      expect(signaled).toEqual([]);
      expect(forced).toEqual([]);
      expect(result.stopped).toEqual([]);
      expect(result.forceKilled).toEqual([]);
      expect(unlinked).toContain(p.identityFile);
      expect(unlinked).toContain(p.serverPortFile);
    });

    it("[web]-only teardown keeps the live server's records and identity", async () => {
      const p = resolveRunPaths(process.cwd(), "web-only-ns");
      const unlinked: string[] = [];
      await teardownOwnedRun(
        p,
        [{ service: "web", pid: 5001, startTimeMs: 10 }],
        {
          isPidLive: () => false,
          unlink: (path: string) => {
            unlinked.push(path);
          },
        }
      );
      expect(unlinked).toContain(p.webPortFile);
      expect(unlinked).toContain(p.webPidFile);
      expect(unlinked).not.toContain(p.serverPortFile);
      expect(unlinked).not.toContain(p.serverPidFile);
      expect(unlinked).not.toContain(p.identityFile);
    });
  });

  describe("ticket 02: two namespaces stay fully disjoint", () => {
    it("resolves disjoint ports, logs, generated configs, and compiler dirs", () => {
      const root = process.cwd();
      const a = resolveRunPaths(root, "alpha");
      const b = resolveRunPaths(root, "beta");
      const genA = resolveGeneratedPathsForRun(a);
      const genB = resolveGeneratedPathsForRun(b);
      const filesA = [...Object.values(a.files), genA.buildDir, genA.distDir, genA.tsconfigPath, genA.cacheDir];
      const filesB = new Set([...Object.values(b.files), genB.buildDir, genB.distDir, genB.tsconfigPath, genB.cacheDir]);
      for (const file of filesA) {
        expect(filesB.has(file)).toBe(false);
      }
      const tmpPrefix = `${root.replaceAll("\\", "/")}/.tmp/`;
      for (const file of [...filesA, ...filesB]) {
        expect(file.replaceAll("\\", "/").startsWith(tmpPrefix)).toBe(true);
      }
      expect(genA.distDir).not.toBe(genB.distDir);
      expect(genA.tsconfigPath).not.toBe(genB.tsconfigPath);
      expect(a.serverLogFile).not.toBe(b.serverLogFile);
      expect(a.serverPortFile).not.toBe(b.serverPortFile);
    });
  });
});

describe("round-2: teardown ownership, completeness, and fault containment", () => {
  it("never deletes records once a successor run owns the identity file", async () => {
    const root = makeTempRoot();
    const p = resolveRunPaths(root, "handover-ns");
    await writeIdentity(p.identityFile, identityRecord("run-successor", "handover-ns"));
    const unlinked: string[] = [];
    const result = await teardownOwnedRun(
      p,
      [
        { service: "server", pid: 9001, startTimeMs: 10 },
        { service: "web", pid: 9002, startTimeMs: 20 },
      ],
      {
        runId: "run-first",
        isPidLive: () => false,
        unlink: (path: string) => {
          unlinked.push(path);
        },
      }
    );
    expect(unlinked).toEqual([]);
    expect(result.cleanedFiles).toEqual([]);
    const successor = await readIdentity(p.identityFile);
    expect(successor?.runId).toBe("run-successor");
  });

  it("still deletes its own records while the identity file carries this run id", async () => {
    const root = makeTempRoot();
    const p = resolveRunPaths(root, "self-own-ns");
    await writeIdentity(p.identityFile, identityRecord("run-ours", "self-own-ns"));
    const unlinked: string[] = [];
    await teardownOwnedRun(p, [{ service: "server", pid: 9003, startTimeMs: 10 }], {
      runId: "run-ours",
      isPidLive: () => false,
      unlink: (path: string) => {
        unlinked.push(path);
      },
    });
    expect(unlinked).toContain(p.identityFile);
    expect(unlinked).toContain(p.serverPortFile);
    expect(unlinked).toContain(p.serverPidFile);
  });

  it("lists a file in cleanedFiles only when the unlink actually succeeded (T3.5)", async () => {
    const root = makeTempRoot();
    const p = resolveRunPaths(root, "unlink-truth-ns");
    // A directory at a record path makes the real unlink fail (EPERM/EISDIR):
    // it must not be reported as cleaned, and later files must still unlink.
    await mkdir(p.serverPortFile, { recursive: true });
    await writeIdentity(p.identityFile, identityRecord("run-truth", "unlink-truth-ns"));
    const result = await teardownOwnedRun(
      p,
      [
        { service: "server", pid: 9004, startTimeMs: 10 },
        { service: "web", pid: 9005, startTimeMs: 20 },
      ],
      { isPidLive: () => false }
    );
    expect(result.cleanedFiles).not.toContain(p.serverPortFile);
    expect(result.cleanedFiles).toContain(p.serverPidFile);
    expect(result.cleanedFiles).toContain(p.identityFile);
    expect(result.cleanedFiles).toContain(p.webPortFile);
    expect(result.cleanedFiles).toContain(p.webPidFile);
    await expect(readIdentity(p.identityFile)).resolves.toBeNull();
  });

  it("contains a rejecting liveness check: later children and file cleanup still run", async () => {
    const p = resolveRunPaths(process.cwd(), "fault-ns");
    const signaled: number[] = [];
    const forced: number[] = [];
    const unlinked: string[] = [];
    const result = await teardownOwnedRun(
      p,
      [
        { service: "server", pid: 6001, startTimeMs: 10 },
        { service: "web", pid: 6002, startTimeMs: 20 },
      ],
      {
        isPidLive: (pid: number) => {
          if (pid === 6002) throw new Error("liveness dependency failed");
          return true;
        },
        graceMs: 0,
        requestGracefulStop: (child) => {
          signaled.push(child.pid);
        },
        forceKill: (pid: number) => {
          forced.push(pid);
        },
        unlink: (path: string) => {
          unlinked.push(path);
        },
      }
    );
    expect(signaled).toEqual([6001]);
    expect(result.stopped).toEqual(["server"]);
    expect(forced).toEqual([6001]);
    expect(unlinked).toContain(p.identityFile);
    expect(unlinked).toContain(p.serverPortFile);
    expect(unlinked).toContain(p.webPortFile);
    expect(unlinked).toContain(p.webPidFile);
  });

  it("defaults to a start-time-aware liveness check (existence alone never signals)", async () => {
    const child = nodeSpawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const childPid = child.pid;
    if (childPid === undefined) throw new Error("spawned child reported no PID");
    try {
      const p = resolveRunPaths(process.cwd(), "default-live-ns");
      const signaled: number[] = [];
      const result = await teardownOwnedRun(
        p,
        [{ service: "server", pid: childPid, startTimeMs: 1 }],
        {
          requestGracefulStop: (c) => {
            signaled.push(c.pid);
          },
          unlink: () => {},
        }
      );
      expect(signaled).toEqual([]);
      expect(result.unverified).toEqual(["server"]);
      expect(() => process.kill(childPid, 0)).not.toThrow();
    } finally {
      child.kill();
    }
  }, 30_000);

  it("reports children that exist but cannot be verified instead of silently skipping", async () => {
    const p = resolveRunPaths(process.cwd(), "unverified-ns");
    const signaled: number[] = [];
    const result = await teardownOwnedRun(p, [{ service: "server", pid: 7001, startTimeMs: 1 }], {
      isPidLive: () => false,
      isPidPresent: () => true,
      requestGracefulStop: () => {
        signaled.push(7001);
      },
      unlink: () => {},
    });
    expect(signaled).toEqual([]);
    expect(result.unverified).toEqual(["server"]);

    const clean = await teardownOwnedRun(p, [{ service: "server", pid: 7002, startTimeMs: 1 }], {
      isPidLive: () => false,
      isPidPresent: () => false,
      unlink: () => {},
    });
    expect(clean.unverified).toEqual([]);
  });

  it("force-kills the process group when the root died during grace but the tree still lives", async () => {
    const p = resolveRunPaths(process.cwd(), "tree-ns");
    let isRootAlive = true;
    const forced: number[] = [];
    const seenPlatforms: string[] = [];
    const result = await teardownOwnedRun(p, [{ service: "server", pid: 8001, startTimeMs: 1 }], {
      platform: "linux",
      isPidLive: () => isRootAlive,
      isTreeLive: (pid: number, platform: string) => {
        seenPlatforms.push(platform);
        return pid === 8001;
      },
      requestGracefulStop: () => {
        isRootAlive = false;
      },
      forceKill: (pid: number) => {
        forced.push(pid);
      },
      unlink: () => {},
    });
    expect(forced).toEqual([8001]);
    expect(result.forceKilled).toEqual(["server"]);
    expect(seenPlatforms).toEqual(["linux"]);
  });

  it("does not force-kill when the root died and the tree is gone too", async () => {
    const p = resolveRunPaths(process.cwd(), "tree-gone-ns");
    let isRootAlive = true;
    const forced: number[] = [];
    await teardownOwnedRun(p, [{ service: "server", pid: 8002, startTimeMs: 1 }], {
      platform: "linux",
      isPidLive: () => isRootAlive,
      isTreeLive: () => false,
      requestGracefulStop: () => {
        isRootAlive = false;
      },
      forceKill: (pid: number) => {
        forced.push(pid);
      },
      unlink: () => {},
    });
    expect(forced).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "group-kills a POSIX tree whose root exits while a descendant keeps running",
    async () => {
      const root = makeTempRoot();
      const p = resolveRunPaths(root, "posix-tree-ns");
      const rootScript = `
const { spawn } = require("child_process");
const kid = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
console.log(kid.pid);
`;
      const rootChild = nodeSpawn(process.execPath, ["-e", rootScript], {
        stdio: ["ignore", "pipe", "ignore"],
        detached: true,
      });
      const rootPid = rootChild.pid;
      if (rootPid === undefined) throw new Error("spawned root child reported no PID");
      const chunks: Buffer[] = [];
      rootChild.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      try {
        const deadline = Date.now() + 15_000;
        let grandPid = 0;
        while (grandPid === 0 && Date.now() < deadline) {
          const text = Buffer.concat(chunks).toString("utf8").trim();
          if (text !== "") grandPid = Number(text.split(/\r?\n/, 1)[0]);
          if (grandPid === 0) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(grandPid).toBeGreaterThan(0);
        // The owned-root contract only signals a start-time-verified live
        // root. The spawned kid keeps the root's event loop alive, so the
        // root is still running here; teardown's SIGTERM is what ends it,
        // while the kid (same process group) keeps running — the group kill
        // is the behavior under test.
        const startTimeMs = await getProcessStartTimeMs(rootPid);
        if (startTimeMs === null) throw new Error("root child start time unreadable");
        const result = await teardownOwnedRun(
          p,
          [{ service: "server", pid: rootPid, startTimeMs }],
          {}
        );
        expect(result.stopped).toEqual(["server"]);
        expect(result.forceKilled).toEqual(["server"]);
        let isGrandAlive = true;
        for (let i = 0; isGrandAlive && i < 50; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          try {
            process.kill(grandPid, 0);
          } catch {
            isGrandAlive = false;
          }
        }
        expect(isGrandAlive).toBe(false);
      } finally {
        try {
          process.kill(rootPid, "SIGKILL");
        } catch {
          // Already reaped.
        }
        try {
          process.kill(0 - rootPid, "SIGKILL");
        } catch {
          // Group already gone.
        }
      }
    },
    30_000
  );
});
