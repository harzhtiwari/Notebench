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
  }, 15000);


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

  it("executes preflightPdf and extractPdf over the pool", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
    });
    await pool.start();

    const { writeFileSync, mkdirSync } = await import("node:fs");
    const testPdfPath = resolve(".tmp/cache/test_pool.pdf");
    mkdirSync(resolve(".tmp/cache"), { recursive: true });
    const content = "BT /F1 14 Tf 50 700 Td (Notebench pool test) Tj ET";
    const pdfData = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000340 00000 n \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n415\n%%EOF\n`;
    writeFileSync(testPdfPath, pdfData, "latin1");

    const preflight = await pool.preflightPdf(testPdfPath);
    expect(preflight.pageCount).toBe(1);

    const extracted = await pool.extractPdf(testPdfPath);
    expect(extracted.pageCount).toBe(1);
    expect(extracted.pages).toHaveLength(1);
  });

  it("executes embedBatch over the pool returning 384-dimensional vectors", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
      requestTimeoutMs: 30000,
    });
    await pool.start();

    const result = await pool.embedBatch(["Notebench fast local embeddings"]);
    expect(result.model).toBe("BAAI/bge-small-en-v1.5");
    expect(result.dimensions).toBe(384);
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(384);
  }, 35000);

  it("executes embedQuery over the pool returning 384-dimensional query vector", async () => {
    const projectDir = resolve("tools/doc-tools");
    pool = new DocWorkerPool({
      projectDir,
      minWorkers: 1,
      maxWorkers: 1,
      requestTimeoutMs: 30000,
    });
    await pool.start();

    const result = await pool.embedQuery("What database does Notebench use?");
    expect(result.model).toBe("BAAI/bge-small-en-v1.5");
    expect(result.dimensions).toBe(384);
    expect(result.embedding).toHaveLength(384);
  }, 35000);
});

