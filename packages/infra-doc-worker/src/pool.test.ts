import { describe, it, expect, afterEach } from "vitest";
import { DocWorkerPool } from "./pool.js";
import { resolve } from "node:path";

describe("DocWorkerPool (Infra Subprocess Pool & JSON-RPC Bridge)", () => {
  let pool: DocWorkerPool | null = null;

  afterEach(async () => {
    if (pool) {
      await pool.stop();
      pool = null;
    }
  });

  it("initializes a bounded worker pool and responds to ping within 50ms on warm probe", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 2,
    });

    await pool.start();

    // Initial probe to warm up the process
    const firstProbe = await pool.ping();
    expect(firstProbe.pong).toBe(true);
    expect(firstProbe.workerPid).toBeGreaterThan(0);
    expect(firstProbe.pythonVersion).toBeDefined();

    // Warm latency assertion: sub-50ms
    const start = performance.now();
    const warmProbe = await pool.ping();
    const duration = performance.now() - start;

    expect(warmProbe.pong).toBe(true);
    expect(duration).toBeLessThan(50); // Strict sub-50ms ping assertion per spec
  });


  it("retrieves worker info and capabilities via JSON-RPC", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
    });

    await pool.start();
    const info = await pool.getWorkerInfo();

    expect(info.name).toBe("doc-tools");
    expect(info.version).toBe("0.1.0");
    expect(info.capabilities).toContain("pdfplumber");
    expect(info.capabilities).toContain("pypdf");
    expect(info.capabilities).toContain("docx");
    expect(info.capabilities).toContain("pptx");
  });

  it("handles concurrent requests across the pool", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 2,
      maxWorkers: 2,
    });

    await pool.start();

    const probes = await Promise.all([
      pool.ping(),
      pool.ping(),
      pool.ping(),
      pool.ping(),
    ]);

    expect(probes).toHaveLength(4);
    for (const probe of probes) {
      expect(probe.pong).toBe(true);
    }
  });

  it("detects worker crash and automatically restarts a healthy worker", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
    });

    await pool.start();
    const initialProbe = await pool.ping();
    const initialPid = initialProbe.workerPid;

    // Simulate unexpected crash of the worker process
    pool.simulateCrash(initialPid);

    // Give time for crash handler & respawn
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Next request should succeed on the respawned worker with a new PID
    const respawnedProbe = await pool.ping();
    expect(respawnedProbe.pong).toBe(true);
    expect(respawnedProbe.workerPid).not.toBe(initialPid);
  });

  it("gracefully stops all workers and transitions state", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
    });

    await pool.start();
    expect(pool.stats().totalWorkers).toBe(1);

    await pool.stop();
    expect(pool.stats().totalWorkers).toBe(0);

    // Sending request after stopped should throw
    await expect(pool.ping()).rejects.toThrow();
  });
});
