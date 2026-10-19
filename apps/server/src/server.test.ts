import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createSqliteDatabase } from "@notebench/infra-db";
import { runHealthProbes } from "@notebench/domain-ops";
import { buildServer, resolveWebOutDir } from "./app.js";

interface ProbeSummary {
  id: string;
  status: string;
  message: string;
}

interface DoctorBody {
  status: string;
  version: string;
  probes: ProbeSummary[];
  docWorker: { status: string; pong: boolean; pythonVersion: string };
}

interface ErrorBody {
  error: { code: string };
}

describe("Fastify Composition Root & Static History Routing (NB-M1-04)", () => {
  let app: FastifyInstance;
  const mockWebOutDir = path.resolve(process.cwd(), `.tmp/test/web-out-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

  beforeAll(async () => {
    // Scaffold mock web export fixtures
    if (!existsSync(mockWebOutDir)) {
      mkdirSync(mockWebOutDir, { recursive: true });
    }
    writeFileSync(
      path.resolve(mockWebOutDir, "index.html"),
      "<!DOCTYPE html><html><head><title>Notebench SPA</title></head><body><div id=\"root\">App Mounted</div></body></html>",
      "utf8"
    );
    writeFileSync(
      path.resolve(mockWebOutDir, "robots.txt"),
      "User-agent: *\nDisallow: /",
      "utf8"
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
      const body = JSON.parse(response.body) as { status: string };
      expect(body).toEqual({ status: "ok" });
    });

    it("GET /livez returns 200 with status ok", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/livez",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as { status: string };
      expect(body).toEqual({ status: "ok" });
    });

    it("GET /api/doctor aggregates top-level status from probes (error when probes fail)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/doctor",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as DoctorBody;
      expect(body.probes).toHaveLength(6);
      expect(body.status).toBe("error");
    });

    it("GET /api/doctor wires a shared SQLite handle so WAL/vec probes query a real DB", async () => {
      const wired = await buildServer({
        staticDir: mockWebOutDir,
        dbPath: ":memory:",
        logger: false,
      });
      await wired.ready();
      const response = await wired.inject({
        method: "GET",
        url: "/api/doctor",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as DoctorBody;
      const wal = body.probes.find((p) => p.id === "sqlite_wal");
      const vec = body.probes.find((p) => p.id === "sqlite_vec");
      expect(wal?.message).not.toContain("not provided");
      expect(vec?.message).not.toContain("not provided");
      await wired.close();
    });

    it("probe battery performs no writes: all probes against a real WAL handle with PRAGMA query_only=ON", async () => {
      const worker = process.env["VITEST_WORKER_ID"] ?? "0";
      const dbFile = path.join(tmpdir(), `nb-doctor-no-write-${worker}-${Date.now()}.sqlite`);
      const instance = createSqliteDatabase({ dbPath: dbFile });
      try {
        const handle = instance.sqlite;
        const countSchemaObjects = (): number => {
          const row = handle.prepare("SELECT COUNT(*) AS n FROM sqlite_schema").get() as {
            n: number | bigint;
          };
          return Number(row.n);
        };
        const schemaBefore = countSchemaObjects();

        // Real no-write guard: SQLite rejects every subsequent write with
        // SQLITE_READONLY, so a probe write attempt cannot pass silently.
        handle.pragma("query_only = ON");

        const results = await runHealthProbes({
          nodeVersion: "22.13.1",
          serverHost: "127.0.0.1",
          sqliteDb: handle,
          docWorkerPool: {
            ping: async () => ({
              pong: true,
              timestamp: Date.now(),
              pythonVersion: "3.12.2",
              workerPid: 7,
            }),
          },
          statfsFn: async () => ({ bsize: 4096, bavail: Math.floor((10 * 1024 * 1024 * 1024) / 4096) }),
        });

        expect(results).toHaveLength(6);

        // WAL probe genuinely reads a real file-backed WAL database.
        const wal = results.find((r) => r.id === "sqlite_wal");
        expect(wal?.status).toBe("pass");

        // Vec probe executed real SQL and failed only on the missing extension:
        // proof the read path actually ran against the engine.
        const vec = results.find((r) => r.id === "sqlite_vec");
        expect(vec?.status).toBe("fail");
        expect(vec?.message).toContain("vec_version");

        // No schema objects created by the battery, and the guard is provably active.
        expect(countSchemaObjects()).toBe(schemaBefore);
        expect(() =>
          handle.prepare("CREATE TABLE probe_no_write_guard (id INTEGER)").run()
        ).toThrow(/readonly/i);
      } finally {
        try {
          instance.sqlite.pragma("query_only = OFF");
        } catch {
          // best-effort guard release before closing
        }
        instance.close();
        rmSync(dbFile, { force: true });
        rmSync(`${dbFile}-wal`, { force: true });
        rmSync(`${dbFile}-shm`, { force: true });
      }
    });

    it("GET /api/doctor returns doc-worker probe results when pool is configured", async () => {
      const mockPool = {
        ping: async () => ({
          pong: true as const,
          timestamp: 123_456_789,
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
      const body = JSON.parse(response.body) as DoctorBody;
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
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("bare /api returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("POST to a client route returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/notebook/nb-123",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("JSON-Accept probe of a client route returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/notebook/nb-123",
        headers: { accept: "application/json" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("missing /_next asset returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/_next/stale-chunk.js",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("HEAD to a client route still serves the shell", async () => {
      const response = await app.inject({
        method: "HEAD",
        url: "/notebook/nb-123",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
    });

    it("bare /api with a query string returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api?x=1",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("missing /_next asset with a version query returns 404 JSON, NOT HTML fallback", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/_next/stale-chunk.js?v=2",
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      const body = JSON.parse(response.body) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Web export directory resolution (prebuilt pack without next dev)", () => {
    // Hermetic fixture workspaces (ticket 08): these tests must not depend
    // on the real `apps/web/out` build artifact, which parallel suites may
    // transiently remove. Each fixture carries its own workspace marker.
    const worker = process.env["VITEST_WORKER_ID"] ?? "0";
    let fixtureCounter = 0;
    const fixtureRoots: string[] = [];
    function makeWorkspace(shouldCreateOut: boolean): string {
      fixtureCounter += 1;
      const root = path.join(tmpdir(), `nb-web-out-${worker}-${fixtureCounter}-${Date.now()}`);
      mkdirSync(root, { recursive: true });
      writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
      if (shouldCreateOut) {
        mkdirSync(path.join(root, "apps", "web", "out"), { recursive: true });
      }
      fixtureRoots.push(root);
      return root;
    }
    afterAll(() => {
      while (fixtureRoots.length > 0) {
        const dir = fixtureRoots.pop();
        if (dir === undefined) {
          break;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("resolves apps/web/out from the workspace root", () => {
      const root = makeWorkspace(true);
      expect(resolveWebOutDir(root)).toBe(path.join(root, "apps", "web", "out"));
    });

    it("resolves apps/web/out when starting from the server package dir", () => {
      const root = makeWorkspace(true);
      expect(resolveWebOutDir(path.join(root, "apps", "server"))).toBe(path.join(root, "apps", "web", "out"));
    });

    it("returns undefined when the export has not been built yet", () => {
      const root = makeWorkspace(false);
      expect(resolveWebOutDir(root)).toBeUndefined();
    });

    it("returns undefined outside any workspace", () => {
      const outside = path.join(tmpdir(), `nb-no-workspace-probe-${worker}`);
      expect(resolveWebOutDir(outside)).toBeUndefined();
    });
  });

});
