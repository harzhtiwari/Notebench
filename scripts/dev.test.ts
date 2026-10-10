import { describe, it, expect, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  findAvailablePort,
  allocateDevPorts,
  ensureStorageLayout,
  writeDevRunState,
  cleanDevRunState,
  killProcessTree,
  startDev,
} from "./dev.js";

const TEST_DIR = join(process.cwd(), ".tmp", "scratch", "dev-test-" + Date.now());

describe("scripts/dev.ts Dynamic Port & Dev Orchestration Runner", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("Dynamic Port Allocation with node:net", () => {
    it("finds an available port starting at the requested startPort", async () => {
      const port = await findAvailablePort(3000, "127.0.0.1");
      expect(typeof port).toBe("number");
      expect(port).toBeGreaterThanOrEqual(3000);
    });

    it("skips occupied ports and picks the next available open port", async () => {
      const busyServer = net.createServer();
      await new Promise<void>((resolve, reject) => {
        busyServer.once("error", reject);
        busyServer.listen(3000, "127.0.0.1", () => resolve());
      });

      try {
        const port = await findAvailablePort(3000, "127.0.0.1");
        expect(port).toBeGreaterThan(3000);
      } finally {
        await new Promise<void>((resolve) => busyServer.close(() => resolve()));
      }
    });

    it("allocates distinct ports for web (starting at 3000) and server (starting at 3001)", async () => {
      const { webPort, serverPort } = await allocateDevPorts({
        preferredWebPort: 3000,
        preferredServerPort: 3001,
        host: "127.0.0.1",
      });

      expect(webPort).toBeGreaterThanOrEqual(3000);
      expect(serverPort).toBeGreaterThanOrEqual(3001);
      expect(webPort).not.toBe(serverPort);
    });

    it("resolves collision when preferred web and server ports are identical", async () => {
      const { webPort, serverPort } = await allocateDevPorts({
        preferredWebPort: 3000,
        preferredServerPort: 3000,
        host: "127.0.0.1",
      });

      expect(webPort).not.toBe(serverPort);
      expect(webPort).toBeGreaterThanOrEqual(3000);
      expect(serverPort).toBeGreaterThanOrEqual(3000);
    });
  });

  describe("Two-Folder Taxonomy Storage Layout Scaffolding", () => {
    it("scaffolds required persistent .notebook/ and ephemeral .tmp/ directories", () => {
      ensureStorageLayout(TEST_DIR);

      const expectedDirs = [
        join(TEST_DIR, ".notebook", "db"),
        join(TEST_DIR, ".notebook", "uploads"),
        join(TEST_DIR, ".notebook", "artifacts"),
        join(TEST_DIR, ".notebook", "runs"),
        join(TEST_DIR, ".notebook", "vault"),
        join(TEST_DIR, ".tmp", "cache"),
        join(TEST_DIR, ".tmp", "logs"),
        join(TEST_DIR, ".tmp", "run"),
        join(TEST_DIR, ".tmp", "reports"),
        join(TEST_DIR, ".tmp", "scratch"),
      ];

      for (const dir of expectedDirs) {
        expect(existsSync(dir), `Directory ${dir} should exist`).toBe(true);
      }
    });
  });

  describe("Ephemeral Run State Lifecycle (.tmp/run/)", () => {
    it("writes assigned ports and PIDs to .tmp/run/ (and legacy .tmp/ports/)", () => {
      ensureStorageLayout(TEST_DIR);

      writeDevRunState(TEST_DIR, {
        webPort: 3000,
        serverPort: 3001,
        webPid: 1234,
        serverPid: 5678,
      });

      const runDir = join(TEST_DIR, ".tmp", "run");
      expect(existsSync(join(runDir, "web.port"))).toBe(true);
      expect(readFileSync(join(runDir, "web.port"), "utf-8")).toBe("3000");

      expect(existsSync(join(runDir, "server.port"))).toBe(true);
      expect(readFileSync(join(runDir, "server.port"), "utf-8")).toBe("3001");

      expect(existsSync(join(runDir, "web.pid"))).toBe(true);
      expect(readFileSync(join(runDir, "web.pid"), "utf-8")).toBe("1234");

      expect(existsSync(join(runDir, "server.pid"))).toBe(true);
      expect(readFileSync(join(runDir, "server.pid"), "utf-8")).toBe("5678");

      // Also verify backward compatibility in .tmp/ports/
      const portsDir = join(TEST_DIR, ".tmp", "ports");
      expect(existsSync(join(portsDir, "web.port"))).toBe(true);
      expect(readFileSync(join(portsDir, "web.port"), "utf-8")).toBe("3000");
      expect(existsSync(join(portsDir, "server.port"))).toBe(true);
      expect(readFileSync(join(portsDir, "server.port"), "utf-8")).toBe("3001");
    });

    it("cleans up ephemeral port and PID files on shutdown", () => {
      ensureStorageLayout(TEST_DIR);

      writeDevRunState(TEST_DIR, {
        webPort: 3000,
        serverPort: 3001,
        webPid: 1234,
        serverPid: 5678,
      });

      cleanDevRunState(TEST_DIR);

      const runDir = join(TEST_DIR, ".tmp", "run");
      expect(existsSync(join(runDir, "web.port"))).toBe(false);
      expect(existsSync(join(runDir, "server.port"))).toBe(false);
      expect(existsSync(join(runDir, "web.pid"))).toBe(false);
      expect(existsSync(join(runDir, "server.pid"))).toBe(false);

      const portsDir = join(TEST_DIR, ".tmp", "ports");
      expect(existsSync(join(portsDir, "web.port"))).toBe(false);
      expect(existsSync(join(portsDir, "server.port"))).toBe(false);
    });
  });

  describe("Process Tree Termination Helper", () => {
    it("safely handles null/undefined/missing PID without throwing", () => {
      expect(() => killProcessTree(undefined)).not.toThrow();
      expect(() => killProcessTree({ pid: undefined })).not.toThrow();
    });
  });

  describe("startDev Orchestrator Lifecycle", () => {
    class MockProcess extends EventEmitter {
      public readonly pid: number;
      public killed = false;

      constructor(pid: number) {
        super();
        this.pid = pid;
      }

      public kill(): boolean {
        this.killed = true;
        return true;
      }
    }

    it("spawns server and web processes and writes runtime state", async () => {
      const spawned: Array<{ cmd: string; args: string[]; env: NodeJS.ProcessEnv | undefined }> = [];
      const processes: MockProcess[] = [];

      const mockSpawn = ((cmd: string, args: readonly string[], options?: { env?: NodeJS.ProcessEnv }) => {
        const proc = new MockProcess(10000 + processes.length);
        spawned.push({ cmd, args: [...args], env: options?.env });
        processes.push(proc);
        return proc as unknown as ChildProcess;
      }) as unknown as typeof import("node:child_process").spawn;

      const result = await startDev({
        root: TEST_DIR,
        preferredWebPort: 3000,
        preferredServerPort: 3001,
        spawnFn: mockSpawn,
      });

      expect(spawned.length).toBe(2);
      expect(result.webPort).toBeGreaterThanOrEqual(3000);
      expect(result.serverPort).toBeGreaterThanOrEqual(3001);

      // Verify files in .tmp/run/
      const runDir = join(TEST_DIR, ".tmp", "run");
      expect(existsSync(join(runDir, "web.port"))).toBe(true);
      expect(existsSync(join(runDir, "server.port"))).toBe(true);
      expect(existsSync(join(runDir, "web.pid"))).toBe(true);
      expect(existsSync(join(runDir, "server.pid"))).toBe(true);

      // Shutdown cleans up files
      result.shutdown();
      expect(existsSync(join(runDir, "web.port"))).toBe(false);
      expect(existsSync(join(runDir, "server.port"))).toBe(false);
      expect(existsSync(join(runDir, "web.pid"))).toBe(false);
      expect(existsSync(join(runDir, "server.pid"))).toBe(false);
    });

    it("triggers shutdown when server child process exits prematurely", async () => {
      const processes: MockProcess[] = [];

      const mockSpawn = (() => {
        const proc = new MockProcess(20000 + processes.length);
        processes.push(proc);
        return proc as unknown as ChildProcess;
      }) as unknown as typeof import("node:child_process").spawn;

      await startDev({
        root: TEST_DIR,
        spawnFn: mockSpawn,
      });

      const runDir = join(TEST_DIR, ".tmp", "run");
      expect(existsSync(join(runDir, "server.port"))).toBe(true);

      // Simulate server crash
      const serverProc = processes[0];
      expect(serverProc).toBeDefined();
      serverProc?.emit("exit", 1);

      // Port file should be removed on shutdown
      expect(existsSync(join(runDir, "server.port"))).toBe(false);
    });
  });
});

