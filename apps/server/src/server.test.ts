import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";

describe("Fastify Composition Root & Static History Routing (NB-M1-04)", () => {
  let app: FastifyInstance;
  const mockWebOutDir = resolve(process.cwd(), ".tmp/test/web-out");

  beforeAll(async () => {
    // Scaffold mock web export fixtures
    if (!existsSync(mockWebOutDir)) {
      mkdirSync(mockWebOutDir, { recursive: true });
    }
    writeFileSync(
      resolve(mockWebOutDir, "index.html"),
      "<!DOCTYPE html><html><head><title>Notebench SPA</title></head><body><div id=\"root\">App Mounted</div></body></html>",
      "utf-8"
    );
    writeFileSync(
      resolve(mockWebOutDir, "robots.txt"),
      "User-agent: *\nDisallow: /",
      "utf-8"
    );

    app = await buildServer({
      staticDir: mockWebOutDir,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (existsSync(mockWebOutDir)) {
      rmSync(mockWebOutDir, { recursive: true, force: true });
    }
  });

  describe("Health & Diagnostics Probes", () => {
    it("GET /healthz returns 200 with status ok", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/healthz",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body);
      expect(body).toEqual({ status: "ok" });
    });

    it("GET /livez returns 200 with status ok", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/livez",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body);
      expect(body).toEqual({ status: "ok" });
    });

    it("GET /api/doctor returns 200 with diagnostic status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/doctor",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.1.0");
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.memory).toBeDefined();
      expect(body.memory.rss).toBeGreaterThan(0);
    });

    it("GET /api/doctor returns doc-worker probe results when pool is configured", async () => {
      const mockPool = {
        ping: async () => ({
          pong: true as const,
          timestamp: 123456789,
          pythonVersion: "3.12.0",
          workerPid: 9999,
        }),
      };

      const serverWithWorker = await buildServer({
        docWorkerPool: mockPool,
        logger: false,
      });

      const response = await serverWithWorker.inject({
        method: "GET",
        url: "/api/doctor",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.docWorker).toBeDefined();
      expect(body.docWorker.status).toBe("ok");
      expect(body.docWorker.pong).toBe(true);
      expect(body.docWorker.pythonVersion).toBe("3.12.0");

      await serverWithWorker.close();
    });
  });


  describe("Static SPA & HTML5 History API Routing", () => {
    it("GET / serves index.html", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Notebench SPA");
    });

    it("GET /robots.txt serves exact static file", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/robots.txt",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("User-agent: *");
    });

    it("GET /notebook/nb-123 falls back to index.html for client route", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/notebook/nb-123",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Notebench SPA");
    });

    it("GET /settings/storage falls back to index.html for deep client route", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/settings/storage",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Notebench SPA");
    });
  });

  describe("API Route Isolation & 404 Behavior", () => {
    it("unknown /api/* route returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/unknown-endpoint",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});
