import { statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  HEALTH_THRESHOLDS,
  type HealthProbeResult,
} from "@notebench/contracts";
import type {
  HealthProbeDefinition,
  HealthProbeContext,
  StatFsResult,
} from "./types.js";

export * from "./types.js";

/**
 * Parses semantic version string into major, minor, patch numbers.
 */
function parseSemver(versionStr: string): [number, number, number] {
  const clean = versionStr.replace(/^v/i, "").trim();
  const [major = 0, minor = 0, patch = 0] = clean.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [major, minor, patch];
}

/**
 * 1. Node.js Runtime Probe (Decision 8.8.1)
 * Asserts process.versions.node >= 22.0.0
 */
export const nodeRuntimeProbe: HealthProbeDefinition = {
  id: "node_runtime",
  name: "Node.js Runtime",
  thresholds: HEALTH_THRESHOLDS.nodeRuntime,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();
    const version = context?.nodeVersion ?? process.versions.node;
    const [major, minor, patch] = parseSemver(version);
    const [reqMajor, reqMinor, reqPatch] = parseSemver(HEALTH_THRESHOLDS.nodeRuntime.minVersion);

    const isSatisfied =
      major > reqMajor ||
      (major === reqMajor && minor > reqMinor) ||
      (major === reqMajor && minor === reqMinor && patch >= reqPatch);

    const durationMs = Date.now() - startTime;

    if (isSatisfied) {
      return {
        id: "node_runtime",
        name: "Node.js Runtime",
        status: "pass",
        message: `Node.js v${version} satisfies >= ${HEALTH_THRESHOLDS.nodeRuntime.minVersion}`,
        details: {
          version,
          required: HEALTH_THRESHOLDS.nodeRuntime.minVersion,
          memoryRss: process.memoryUsage().rss,
        },
        durationMs,
      };
    }

    return {
      id: "node_runtime",
      name: "Node.js Runtime",
      status: "fail",
      message: `Node.js v${version} is below required >= ${HEALTH_THRESHOLDS.nodeRuntime.minVersion}`,
      details: {
        version,
        required: HEALTH_THRESHOLDS.nodeRuntime.minVersion,
      },
      durationMs,
    };
  },
};

/**
 * 2. Python Doc-Worker Probe (Decision 8.8.2, 9.2)
 * Dispatches JSON-RPC ping; asserts pong within 2,000ms.
 */
export const pythonWorkerProbe: HealthProbeDefinition = {
  id: "python_worker",
  name: "Python Doc-Worker Pool",
  thresholds: HEALTH_THRESHOLDS.pythonWorker,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();
    const pool = context?.docWorkerPool;

    if (!pool) {
      return {
        id: "python_worker",
        name: "Python Doc-Worker Pool",
        status: "fail",
        message: "Python doc-worker pool is not configured or uninitialized",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Ping timeout: exceeded ${HEALTH_THRESHOLDS.pythonWorker.maxPingMs} ms`));
        }, HEALTH_THRESHOLDS.pythonWorker.maxPingMs);
      });

      const pingResult = await Promise.race([pool.ping(), timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      const durationMs = Date.now() - startTime;

      if (pingResult && pingResult.pong) {
        return {
          id: "python_worker",
          name: "Python Doc-Worker Pool",
          status: "pass",
          message: `Worker responsive (${durationMs}ms, Python ${pingResult.pythonVersion})`,
          details: {
            latencyMs: durationMs,
            pythonVersion: pingResult.pythonVersion,
            workerPid: pingResult.workerPid,
          },
          durationMs,
        };
      }

      return {
        id: "python_worker",
        name: "Python Doc-Worker Pool",
        status: "fail",
        message: "Worker ping failed: missing pong response",
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        id: "python_worker",
        name: "Python Doc-Worker Pool",
        status: "fail",
        message: `Python worker ping failed: ${msg}`,
        durationMs,
      };
    }
  },
};

/**
 * 3. SQLite WAL Mode Probe (Decision 8.8.3)
 * Asserts PRAGMA journal_mode = 'wal'. Does not mutate database.
 */
export const sqliteWalProbe: HealthProbeDefinition = {
  id: "sqlite_wal",
  name: "SQLite Database",
  thresholds: HEALTH_THRESHOLDS.sqliteWal,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();
    const db = context?.sqliteDb;

    if (!db) {
      return {
        id: "sqlite_wal",
        name: "SQLite Database",
        status: "fail",
        message: "SQLite database target not provided",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const rawMode = db.pragma("journal_mode", { simple: true });
      const mode =
        typeof rawMode === "string"
          ? rawMode.trim().toLowerCase()
          : Array.isArray(rawMode) && rawMode[0] && typeof rawMode[0] === "object" && "journal_mode" in rawMode[0]
            ? String((rawMode[0] as { journal_mode: unknown }).journal_mode).trim().toLowerCase()
            : String(rawMode).trim().toLowerCase();

      const durationMs = Date.now() - startTime;

      if (mode === HEALTH_THRESHOLDS.sqliteWal.expectedJournalMode) {
        return {
          id: "sqlite_wal",
          name: "SQLite Database",
          status: "pass",
          message: "SQLite journal mode is wal",
          details: { journalMode: mode },
          durationMs,
        };
      }

      return {
        id: "sqlite_wal",
        name: "SQLite Database",
        status: "fail",
        message: `SQLite journal mode is ${mode}, expected ${HEALTH_THRESHOLDS.sqliteWal.expectedJournalMode}`,
        details: { journalMode: mode },
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        id: "sqlite_wal",
        name: "SQLite Database",
        status: "fail",
        message: `SQLite WAL query failed: ${msg}`,
        durationMs,
      };
    }
  },
};

/**
 * 4. sqlite-vec Readiness Probe (Decision 8.8.4)
 * Asserts extension loaded and checks vec_version().
 */
export const sqliteVecProbe: HealthProbeDefinition = {
  id: "sqlite_vec",
  name: "Vector Store",
  thresholds: HEALTH_THRESHOLDS.sqliteVec,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();
    const db = context?.sqliteDb;

    if (!db) {
      return {
        id: "sqlite_vec",
        name: "Vector Store",
        status: "fail",
        message: "Vector database target not provided",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Extension registration (sqliteVec.load(db) per the sqlite-vec docs)
      // happens once at database open in packages/infra-vectorstore; this
      // probe only reads SELECT vec_version() and never writes.
      const stmt = db.prepare("SELECT vec_version() AS version");
      const row = stmt.get() as { version?: unknown } | undefined;
      const durationMs = Date.now() - startTime;

      if (row && typeof row.version === "string" && row.version.length > 0) {
        return {
          id: "sqlite_vec",
          name: "Vector Store",
          status: "pass",
          message: `sqlite-vec loaded (${row.version})`,
          details: { version: row.version },
          durationMs,
        };
      }

      return {
        id: "sqlite_vec",
        name: "Vector Store",
        status: "fail",
        message: "sqlite-vec extension is not loaded or missing vec_version",
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        id: "sqlite_vec",
        name: "Vector Store",
        status: "fail",
        message: `sqlite-vec check failed: ${msg}`,
        durationMs,
      };
    }
  },
};

/**
 * 5. Filesystem Disk Capacity Probe (Decision 8.8.5)
 * Queries statfs on .notebook partition (>= 5 GB pass, 1–5 GB warn, < 1 GB fail).
 */
export const diskCapacityProbe: HealthProbeDefinition = {
  id: "disk_capacity",
  name: "Disk Capacity",
  thresholds: HEALTH_THRESHOLDS.diskCapacity,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();

    try {
      const notebookPath = context?.notebookDir ?? (
        existsSync(resolve(process.cwd(), ".notebook"))
          ? resolve(process.cwd(), ".notebook")
          : process.cwd()
      );

      const statfsFn = context?.statfsFn ?? (async (p: string): Promise<StatFsResult> => {
        return statfs(p);
      });

      const stats = await statfsFn(notebookPath);
      // Mandatory formula (Node fs.statfs docs): free bytes available to the
      // unprivileged user = BigInt(bavail) * BigInt(bsize). bavail, NOT bfree.
      const freeBytes = Number(BigInt(stats.bavail) * BigInt(stats.bsize));
      const freeGb = freeBytes / (1024 * 1024 * 1024);
      const durationMs = Date.now() - startTime;

      const { passBytes, warnBytes } = HEALTH_THRESHOLDS.diskCapacity;

      if (freeBytes >= passBytes) {
        return {
          id: "disk_capacity",
          name: "Disk Capacity",
          status: "pass",
          message: `Disk free: ${freeGb.toFixed(2)} GB (>= 5 GB)`,
          details: {
            freeBytes,
            freeGb: Number(freeGb.toFixed(2)),
            threshold: ">= 5 GB",
          },
          durationMs,
        };
      }

      if (freeBytes >= warnBytes) {
        return {
          id: "disk_capacity",
          name: "Disk Capacity",
          status: "warn",
          message: `Disk low: ${freeGb.toFixed(2)} GB free (1–5 GB warning)`,
          details: {
            freeBytes,
            freeGb: Number(freeGb.toFixed(2)),
            threshold: "1–5 GB",
          },
          durationMs,
        };
      }

      return {
        id: "disk_capacity",
        name: "Disk Capacity",
        status: "fail",
        message: `Disk critical: ${freeGb.toFixed(2)} GB free (< 1 GB failure)`,
        details: {
          freeBytes,
          freeGb: Number(freeGb.toFixed(2)),
          threshold: "< 1 GB",
        },
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        id: "disk_capacity",
        name: "Disk Capacity",
        status: "fail",
        message: `Failed to query disk capacity: ${msg}`,
        durationMs,
      };
    }
  },
};

/**
 * 6. Exposure Alert Probe (Decision 1.44, 6.9, 8.8.6)
 * Checks interface binding; daemon bound to non-loopback is alert only when
 * no owner passcode is configured (PRD 1.44 / 8.8.6).
 */
export const exposureProbe: HealthProbeDefinition = {
  id: "exposure",
  name: "Exposure Alert",
  thresholds: HEALTH_THRESHOLDS.exposure,
  run: async (context?: HealthProbeContext): Promise<HealthProbeResult> => {
    const startTime = Date.now();
    const host = context?.serverHost ?? process.env["HOST"] ?? "127.0.0.1";
    const hasOwnerPasscode = context?.hasOwnerPasscode === true;
    const durationMs = Date.now() - startTime;

    const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

    if (isLoopback) {
      return {
        id: "exposure",
        name: "Exposure Alert",
        status: "pass",
        message: `Bound to loopback interface (${host})`,
        details: {
          host,
          isLoopback: true,
          isExposed: false,
        },
        durationMs,
      };
    }

    if (hasOwnerPasscode) {
      // Non-loopback bind protected by an owner passcode: no alert, no banner.
      // `undefined` deliberately stays an alert (fail-safe): the absence of
      // passcode information is not proof that a passcode is configured.
      return {
        id: "exposure",
        name: "Exposure Alert",
        status: "pass",
        message: `Bound to non-loopback interface (${host}) with an owner passcode configured; exposure alert suppressed`,
        details: {
          host,
          isLoopback: false,
          isExposed: true,
          hasOwnerPasscode: true,
        },
        durationMs,
      };
    }

    return {
      id: "exposure",
      name: "Exposure Alert",
      status: "warn",
      message: HEALTH_THRESHOLDS.exposure.warningMessage,
      details: {
        host,
        isLoopback: false,
        isExposed: true,
      },
      durationMs,
    };
  },
};

/**
 * Single canonical healthProbes array { id, name, run, thresholds } (Reuse Rule).
 */
export const healthProbes: readonly HealthProbeDefinition[] = [
  nodeRuntimeProbe,
  pythonWorkerProbe,
  sqliteWalProbe,
  sqliteVecProbe,
  diskCapacityProbe,
  exposureProbe,
];

/**
 * Retrieves a probe by ID with non-null assertion guarantee.
 */
export function getHealthProbe(id: string): HealthProbeDefinition {
  const found = healthProbes.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Health probe with id '${id}' not found in registry`);
  }
  return found;
}

/**
 * Aggregate runner executing all probes in sequence or parallel.
 */
export async function runHealthProbes(context?: HealthProbeContext): Promise<HealthProbeResult[]> {
  return Promise.all(healthProbes.map((probe) => probe.run(context)));
}
