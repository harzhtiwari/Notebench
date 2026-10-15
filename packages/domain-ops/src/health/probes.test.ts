import { describe, it, expect, vi } from "vitest";
import type { DocWorkerProbe } from "@notebook/contracts";
import {
  healthProbes,
  getHealthProbe,
  runHealthProbes,
  type HealthProbeContext,
  type SqliteHealthProbeTarget,
} from "./probes.js";

describe("System Health 6-Point Diagnostic Suite (Ticket 24 - RED phase)", () => {
  describe("healthProbes Array & Reuse Rule", () => {
    it("contains exactly six probes with { id, name, run, thresholds }", () => {
      expect(healthProbes).toBeDefined();
      expect(healthProbes).toHaveLength(6);

      const probeIds = healthProbes.map((p) => p.id);
      expect(probeIds).toEqual([
        "node_runtime",
        "python_worker",
        "sqlite_wal",
        "sqlite_vec",
        "disk_capacity",
        "exposure",
      ]);

      for (const probe of healthProbes) {
        expect(typeof probe.id).toBe("string");
        expect(typeof probe.name).toBe("string");
        expect(typeof probe.run).toBe("function");
        expect(probe.thresholds).toBeDefined();
      }
    });
  });

  describe("Probe 1: Node.js Runtime", () => {
    const nodeProbe = getHealthProbe("node_runtime");

    it("passes when Node runtime is >= 22.0.0", async () => {
      const result = await nodeProbe.run({
        nodeVersion: "22.13.1",
      });

      expect(result.id).toBe("node_runtime");
      expect(result.status).toBe("pass");
      expect(result.message).toContain("22.13.1");
    });

    it("fails when planted Node version is < 22.0.0", async () => {
      const result = await nodeProbe.run({
        nodeVersion: "20.10.0",
      });

      expect(result.id).toBe("node_runtime");
      expect(result.status).toBe("fail");
      expect(result.message).toContain("20.10.0");
      expect(result.message).toContain("22.0.0");
    });
  });

  describe("Probe 2: Python Doc-Worker Pool", () => {
    const pythonProbe = getHealthProbe("python_worker");

    it("passes when worker ping responds within 2000 ms", async () => {
      const mockWorker: DocWorkerProbe = {
        ping: async () => ({
          pong: true,
          timestamp: Date.now(),
          pythonVersion: "3.12.2",
          workerPid: 5432,
        }),
      };

      const result = await pythonProbe.run({
        docWorkerPool: mockWorker,
      });

      expect(result.id).toBe("python_worker");
      expect(result.status).toBe("pass");
      expect(result.message).toContain("3.12.2");
    });

    it("fails when planted worker ping throws an error", async () => {
      const failingWorker: DocWorkerProbe = {
        ping: async () => {
          throw new Error("Worker subprocess dead");
        },
      };

      const result = await pythonProbe.run({
        docWorkerPool: failingWorker,
      });

      expect(result.id).toBe("python_worker");
      expect(result.status).toBe("fail");
      expect(result.message).toContain("Worker subprocess dead");
    });

    it("fails when planted worker ping exceeds 2000 ms timeout", async () => {
      const hangingWorker: DocWorkerProbe = {
        ping: async () => {
          await new Promise((r) => setTimeout(r, 2500));
          return {
            pong: true,
            timestamp: Date.now(),
            pythonVersion: "3.12.2",
            workerPid: 5432,
          };
        },
      };

      const result = await pythonProbe.run({
        docWorkerPool: hangingWorker,
      });

      expect(result.id).toBe("python_worker");
      expect(result.status).toBe("fail");
      expect(result.message.toLowerCase()).toContain("timeout");
    }, 10000);
  });

  describe("Probe 3: SQLite WAL Mode", () => {
    const walProbe = getHealthProbe("sqlite_wal");

    it("passes when journal_mode is 'wal'", async () => {
      const mockDb: SqliteHealthProbeTarget = {
        pragma: vi.fn().mockReturnValue("wal"),
        prepare: vi.fn(),
      };

      const result = await walProbe.run({
        sqliteDb: mockDb,
      });

      expect(result.id).toBe("sqlite_wal");
      expect(result.status).toBe("pass");
      expect(result.message.toLowerCase()).toContain("wal");
      expect(mockDb.pragma).toHaveBeenCalledWith("journal_mode", { simple: true });
    });

    it("fails when planted journal_mode is 'delete' or 'memory'", async () => {
      const mockDb: SqliteHealthProbeTarget = {
        pragma: vi.fn().mockReturnValue("delete"),
        prepare: vi.fn(),
      };

      const result = await walProbe.run({
        sqliteDb: mockDb,
      });

      expect(result.id).toBe("sqlite_wal");
      expect(result.status).toBe("fail");
      expect(result.message).toContain("delete");
    });

    it("proves probe does NOT write to the database (pure read-only)", async () => {
      const writtenOperations: string[] = [];
      const mockDb: SqliteHealthProbeTarget = {
        pragma: vi.fn((stmt: string) => {
          if (stmt.toLowerCase().includes("wal =") || stmt.toLowerCase().includes("write")) {
            writtenOperations.push(stmt);
          }
          return "wal";
        }),
        prepare: vi.fn((sql: string) => {
          if (/insert|update|delete|create|drop|alter/i.test(sql)) {
            writtenOperations.push(sql);
          }
          return { get: vi.fn() };
        }),
      };

      await walProbe.run({ sqliteDb: mockDb });

      expect(writtenOperations).toHaveLength(0);
    });
  });

  describe("Probe 4: sqlite-vec Extension", () => {
    const vecProbe = getHealthProbe("sqlite_vec");

    it("passes when extension is loaded and reports version", async () => {
      const mockDb: SqliteHealthProbeTarget = {
        pragma: vi.fn(),
        prepare: vi.fn().mockReturnValue({
          get: () => ({ version: "v0.1.9" }),
        }),
      };

      const result = await vecProbe.run({
        sqliteDb: mockDb,
      });

      expect(result.id).toBe("sqlite_vec");
      expect(result.status).toBe("pass");
      expect(result.message).toContain("v0.1.9");
    });

    it("fails when sqlite-vec is unavailable or vec_version() throws", async () => {
      const mockDb: SqliteHealthProbeTarget = {
        pragma: vi.fn(),
        prepare: vi.fn().mockReturnValue({
          get: () => {
            throw new Error("no such function: vec_version");
          },
        }),
      };

      const result = await vecProbe.run({
        sqliteDb: mockDb,
      });

      expect(result.id).toBe("sqlite_vec");
      expect(result.status).toBe("fail");
      expect(result.message).toContain("vec_version");
    });
  });

  describe("Probe 5: Disk Capacity", () => {
    const diskProbe = getHealthProbe("disk_capacity");
    const ONE_GB = 1024 * 1024 * 1024;

    it("passes when disk free capacity is >= 5 GB (e.g. 6 GB)", async () => {
      const fakeStatfs = vi.fn().mockResolvedValue({
        bsize: 4096,
        bavail: Math.floor((6 * ONE_GB) / 4096),
      });

      const result = await diskProbe.run({
        statfsFn: fakeStatfs,
      });

      expect(result.id).toBe("disk_capacity");
      expect(result.status).toBe("pass");
      expect(result.message).toContain("6.00 GB");
    });

    it("warns when disk free capacity is 4 GB (1–5 GB threshold)", async () => {
      const fakeStatfs = vi.fn().mockResolvedValue({
        bsize: 4096,
        bavail: Math.floor((4 * ONE_GB) / 4096),
      });

      const result = await diskProbe.run({
        statfsFn: fakeStatfs,
      });

      expect(result.id).toBe("disk_capacity");
      expect(result.status).toBe("warn");
      expect(result.message).toContain("4.00 GB");
    });

    it("fails when disk free capacity is 0.5 GB (< 1 GB threshold)", async () => {
      const fakeStatfs = vi.fn().mockResolvedValue({
        bsize: 4096,
        bavail: Math.floor((0.5 * ONE_GB) / 4096),
      });

      const result = await diskProbe.run({
        statfsFn: fakeStatfs,
      });

      expect(result.id).toBe("disk_capacity");
      expect(result.status).toBe("fail");
      expect(result.message).toContain("0.50 GB");
    });

    it("computes BigInt(bavail) * BigInt(bsize) from bigint statfs inputs", async () => {
      const bavail = BigInt(Math.floor((6 * ONE_GB) / 4096));
      const fakeStatfs = vi.fn().mockResolvedValue({
        bsize: 4096n,
        bavail,
      });

      const result = await diskProbe.run({
        statfsFn: fakeStatfs,
      });

      expect(result.id).toBe("disk_capacity");
      expect(result.status).toBe("pass");
      expect(result.details?.["freeBytes"]).toBe(Number(bavail * 4096n));
    });

    it("uses bavail (not bfree): huge bfree with tiny bavail still fails", async () => {
      const fakeStatfs = vi.fn().mockResolvedValue({
        bsize: 4096,
        bavail: Math.floor((0.5 * ONE_GB) / 4096),
        bfree: Math.floor((100 * ONE_GB) / 4096),
      });

      const result = await diskProbe.run({
        statfsFn: fakeStatfs,
      });

      expect(result.id).toBe("disk_capacity");
      expect(result.status).toBe("fail");
    });
  });

  describe("Probe 6: Exposure Alert", () => {
    const exposureProbe = getHealthProbe("exposure");

    it("passes when daemon is bound to loopback interface (127.0.0.1)", async () => {
      const result = await exposureProbe.run({
        serverHost: "127.0.0.1",
      });

      expect(result.id).toBe("exposure");
      expect(result.status).toBe("pass");
      expect(result.message).toContain("127.0.0.1");
    });

    it("alerts (status 'warn') when daemon is bound to non-loopback (0.0.0.0)", async () => {
      const result = await exposureProbe.run({
        serverHost: "0.0.0.0",
        hasOwnerPasscode: false,
      });

      expect(result.id).toBe("exposure");
      expect(result.status).toBe("warn");
      expect(result.message).toContain(
        "Security Notice: Notebench is accessible on your local network without a passcode. Set a passcode in Account Settings."
      );
    });
  });

  describe("runHealthProbes Aggregate Runner", () => {
    it("runs all six probes and returns six results matching DoctorReport schema", async () => {
      const ONE_GB = 1024 * 1024 * 1024;
      const context: HealthProbeContext = {
        nodeVersion: "22.13.1",
        serverHost: "127.0.0.1",
        docWorkerPool: {
          ping: async () => ({
            pong: true,
            timestamp: Date.now(),
            pythonVersion: "3.12.2",
            workerPid: 1000,
          }),
        },
        sqliteDb: {
          pragma: vi.fn().mockReturnValue("wal"),
          prepare: vi.fn().mockReturnValue({
            get: () => ({ version: "v0.1.9" }),
          }),
        },
        statfsFn: vi.fn().mockResolvedValue({
          bsize: 4096,
          bavail: Math.floor((10 * ONE_GB) / 4096),
        }),
      };

      const results = await runHealthProbes(context);
      expect(results).toHaveLength(6);
      expect(results.every((r) => r.status === "pass")).toBe(true);
    });
  });
});
