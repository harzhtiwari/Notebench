import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  DoctorReport,
  DocWorkerProbe,
} from "@notebench/contracts";
import {
  runHealthProbes,
  type SqliteHealthProbeTarget,
  type HealthProbeContext,
} from "@notebench/domain-ops";
import type { Logger } from "@notebench/logger";

export interface DoctorRouteOptions {
  docWorkerPool?: DocWorkerProbe | undefined;
  sqliteDb?: SqliteHealthProbeTarget | undefined;
  serverHost?: string | undefined;
  hasOwnerPasscode?: boolean | undefined;
  appLogger?: Logger | undefined;
}

interface DoctorQuery {
  host?: string;
  hasPasscode?: string;
}

/**
 * Registers the /api/doctor diagnostic endpoint (NOTEBENCH Decision 8.8).
 */
export function registerDoctorRoutes(
  app: FastifyInstance,
  options: DoctorRouteOptions = {}
): void {
  app.get(
    "/api/doctor",
    async (
      request: FastifyRequest<{ Querystring: DoctorQuery }>
    ): Promise<DoctorReport> => {
      options.appLogger?.debug("Doctor diagnostics probe requested");

      const queryHost = request.query.host;
      const queryHasPasscode = request.query.hasPasscode !== undefined
        ? request.query.hasPasscode === "true"
        : undefined;

      const effectiveHost = queryHost ?? options.serverHost ?? process.env["HOST"] ?? "127.0.0.1";
      const effectiveHasPasscode = queryHasPasscode ?? options.hasOwnerPasscode;

      const probeContext: HealthProbeContext = {
        docWorkerPool: options.docWorkerPool,
        sqliteDb: options.sqliteDb,
        serverHost: effectiveHost,
        hasOwnerPasscode: effectiveHasPasscode,
      };

      const probes = await runHealthProbes(probeContext);

      const aggregateStatus = probes.some((p) => p.status === "fail")
        ? "error"
        : probes.some((p) => p.status === "warn")
          ? "warn"
          : "ok";

      // Backward-compatible docWorker summary for existing clients and tests
      let docWorkerStatus: unknown = undefined;
      if (options.docWorkerPool) {
        const pyProbe = probes.find((p) => p.id === "python_worker");
        if (pyProbe?.status === "pass" && pyProbe.details) {
          docWorkerStatus = {
            status: "ok",
            pong: true,
            timestamp: Date.now(),
            pythonVersion: pyProbe.details["pythonVersion"],
            workerPid: pyProbe.details["workerPid"],
          };
        } else {
          docWorkerStatus = {
            status: "error",
            error: pyProbe?.message ?? "Python worker probe failed",
          };
        }
      }

      const report: DoctorReport = {
        status: aggregateStatus,
        version: "0.1.0",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        probes,
        ...(docWorkerStatus !== undefined ? { docWorker: docWorkerStatus } : {}),
      };

      return report;
    }
  );
}
