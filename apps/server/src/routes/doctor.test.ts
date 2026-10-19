import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

interface DoctorProbe {
  id: string;
  status: string;
  message: string;
}

interface DoctorBody {
  status: string;
  version: string;
  probes: DoctorProbe[];
}

describe("Doctor Diagnostic Route GET /api/doctor (Ticket 24 - RED phase)", () => {
  it("returns exactly six probes and overall ok status when all pass", async () => {
    const mockDocWorker = {
      ping: vi.fn().mockResolvedValue({
        pong: true,
        timestamp: Date.now(),
        pythonVersion: "3.12.0",
        workerPid: 1234,
      }),
    };

    const server: FastifyInstance = await buildServer({
      logger: false,
      docWorkerPool: mockDocWorker,
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/doctor",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as DoctorBody;

    expect(body.status).toBeDefined();
    expect(body.version).toBe("0.1.0");
    expect(body.probes).toBeDefined();
    expect(body.probes).toHaveLength(6);

    const probeIds = body.probes.map((p: { id: string }) => p.id);
    expect(probeIds).toContain("node_runtime");
    expect(probeIds).toContain("python_worker");
    expect(probeIds).toContain("sqlite_wal");
    expect(probeIds).toContain("sqlite_vec");
    expect(probeIds).toContain("disk_capacity");
    expect(probeIds).toContain("exposure");

    await server.close();
  });

  it("emits exposure alert warning when host is bound to non-loopback 0.0.0.0", async () => {
    const server: FastifyInstance = await buildServer({
      logger: false,
    });

    // Request with simulated non-loopback host
    const response = await server.inject({
      method: "GET",
      url: "/api/doctor?host=0.0.0.0",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as DoctorBody;
    const exposureProbe = body.probes.find((p) => p.id === "exposure");

    expect(exposureProbe).toBeDefined();
    expect(exposureProbe?.status).toBe("warn");
    expect(exposureProbe?.message).toContain("Security Notice: Notebench is accessible on your local network");

    await server.close();
  });

  it("suppresses the exposure alert when network-bound with an owner passcode configured", async () => {
    const server: FastifyInstance = await buildServer({
      logger: false,
      hasOwnerPasscode: true,
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/doctor?host=0.0.0.0",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as DoctorBody;
    const exposureProbe = body.probes.find((p) => p.id === "exposure");

    expect(exposureProbe).toBeDefined();
    expect(exposureProbe?.status).toBe("pass");
    expect(exposureProbe?.message).not.toContain("without a passcode");

    await server.close();
  });
});
