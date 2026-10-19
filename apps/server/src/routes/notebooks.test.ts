import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import {
  createSqliteDatabase,
  initializeSqliteSchema,
  SqliteNotebookRepository,
  type SqliteDatabaseInstance,
} from "@notebench/infra-db";
import { NotebookService } from "@notebench/domain-notebooks";
import { notebooksRoutes } from "./notebooks.js";

interface NotebookSummary {
  id: string;
  title: string;
  trashedAt?: string | null;
}

interface NotebookBody {
  notebook: NotebookSummary;
}

interface NotebookListBody {
  notebooks: NotebookSummary[];
}

interface ErrorBody {
  error: { code: string };
}

interface MetricsBody {
  metrics: { storageSafeCapBytes: number; notebookCount: number };
}

describe("Notebooks Fastify Routes (Ticket 05)", () => {
  let app: FastifyInstance;
  let dbInstance: SqliteDatabaseInstance;
  const testUserId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    dbInstance = createSqliteDatabase({ dbPath: ":memory:" });
    initializeSqliteSchema(dbInstance.sqlite);

    // Seed test owner user
    const now = new Date().toISOString();
    dbInstance.sqlite.exec(`
      INSERT INTO users (id, email, display_name, role, created_at, updated_at)
      VALUES ('${testUserId}', 'owner@notebench.local', 'Owner', 'owner', '${now}', '${now}');
    `);

    app = await buildServer({
      logger: false,
      db: dbInstance,
      defaultUserId: testUserId,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    dbInstance.close();
  });

  it("POST /api/notebooks creates a notebook and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Biology 101" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as NotebookBody;
    expect(body.notebook).toBeDefined();
    expect(body.notebook.id).toBeDefined();
    expect(body.notebook.title).toBe("Biology 101");
  });

  it("POST /api/notebooks rejects empty title with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: ' '.repeat(3) },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/notebooks lists active notebooks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/notebooks",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as NotebookListBody;
    expect(Array.isArray(body.notebooks)).toBe(true);
    expect(body.notebooks.some((n: { title: string }) => n.title === "Biology 101")).toBe(true);
  });

  it("PATCH /api/notebooks/:id renames notebook and returns 200", async () => {
    // Create first
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Original Name" },
    });
    const createdId = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;

    // Rename
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/notebooks/${createdId}`,
      payload: { title: "Renamed Name" },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = JSON.parse(patchRes.body) as NotebookBody;
    expect(body.notebook.title).toBe("Renamed Name");
  });

  it("PATCH /api/notebooks/:id returns 404 for unknown notebook", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/notebooks/00000000-0000-4000-8000-000000000000",
      payload: { title: "New Name" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST /api/notebooks/:id/duplicate creates a separate notebook copy and returns 201", async () => {
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Astrophysics" },
    });
    const origId = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;

    const dupRes = await app.inject({
      method: "POST",
      url: `/api/notebooks/${origId}/duplicate`,
      payload: { title: "Copy of Astrophysics" },
    });

    expect(dupRes.statusCode).toBe(201);
    const body = JSON.parse(dupRes.body) as NotebookBody;
    expect(body.notebook.id).not.toBe(origId);
    expect(body.notebook.title).toBe("Copy of Astrophysics");

    // Both should exist in list
    const listRes = await app.inject({
      method: "GET",
      url: "/api/notebooks",
    });
    const list = (JSON.parse(listRes.body) as NotebookListBody).notebooks;
    expect(list.some((n: { id: string }) => n.id === origId)).toBe(true);
    expect(list.some((n: { id: string }) => n.id === body.notebook.id)).toBe(true);
  });

  it("GET /api/notebooks/metrics returns storage cap and counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/notebooks/metrics",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as MetricsBody;
    expect(body.metrics).toBeDefined();
    expect(body.metrics.storageSafeCapBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(typeof body.metrics.notebookCount).toBe("number");
  });

  it("GET /api/notebooks?filter= matches titles and ingested source filenames and returns [] on zero matches", async () => {
    await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "FilterProbe Alpha" },
    });

    const hit = await app.inject({
      method: "GET",
      url: "/api/notebooks?filter=filterprobe",
    });
    expect(hit.statusCode).toBe(200);
    const hitBody = JSON.parse(hit.body) as NotebookListBody;
    expect(hitBody.notebooks.length).toBeGreaterThan(0);
    expect(
      hitBody.notebooks.every((n: { title: string }) =>
        n.title.toLowerCase().includes("filterprobe")
      )
    ).toBe(true);

    // Decision 1.35: source filenames match too, even when the title does not
    const sourceNotebookRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Ingestion Target Probe" },
    });
    const sourceNotebookId = (JSON.parse(sourceNotebookRes.body) as NotebookBody).notebook.id;
    const now = new Date().toISOString();
    dbInstance.sqlite.exec(`
      INSERT INTO sources (id, user_id, notebook_id, title, type, created_at, updated_at)
      VALUES ('99999999-9999-4999-8999-999999999991', '${testUserId}', '${sourceNotebookId}', 'deep-research-notes.md', 'md', '${now}', '${now}');
    `);

    const sourceHit = await app.inject({
      method: "GET",
      url: "/api/notebooks?filter=deep-research",
    });
    expect(sourceHit.statusCode).toBe(200);
    expect(
      (JSON.parse(sourceHit.body) as NotebookListBody).notebooks.some(
        (n: { id: string }) => n.id === sourceNotebookId
      )
    ).toBe(true);

    const miss = await app.inject({
      method: "GET",
      url: "/api/notebooks?filter=no-such-notebook-zzz",
    });
    expect(miss.statusCode).toBe(200);
    expect((JSON.parse(miss.body) as NotebookListBody).notebooks).toEqual([]);
  });

  it("GET /api/notebooks?sort= orders by all 4 keys (updated, created, title, size)", async () => {
    const alphaId = "10000000-0000-4000-8000-000000000001";
    const betaId = "10000000-0000-4000-8000-000000000002";
    const gammaId = "10000000-0000-4000-8000-000000000003";
    dbInstance.sqlite.exec(`
      INSERT INTO notebooks (id, user_id, title, created_at, updated_at) VALUES
        ('${alphaId}', '${testUserId}', 'AAA Sortable Probe', '2024-01-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'),
        ('${betaId}', '${testUserId}', 'MMM Sortable Probe', '2024-02-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
        ('${gammaId}', '${testUserId}', 'ZZZ Sortable Probe', '2024-03-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z');
      INSERT INTO sources (id, user_id, notebook_id, title, type, byte_size, created_at, updated_at) VALUES
        ('10000000-0000-4000-8000-000000000011', '${testUserId}', '${alphaId}', 'alpha.pdf', 'pdf', 300, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
        ('10000000-0000-4000-8000-000000000012', '${testUserId}', '${betaId}', 'beta.pdf', 'pdf', 100, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
        ('10000000-0000-4000-8000-000000000013', '${testUserId}', '${gammaId}', 'gamma.pdf', 'pdf', 200, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `);

    // Other tests' notebooks stay interleaved in the full list; only the
    // relative order of these three seeded notebooks is asserted.
    const seededIds = new Set([alphaId, betaId, gammaId]);
    const seededOrder = async (query: string): Promise<string[]> => {
      const res = await app.inject({ method: "GET", url: `/api/notebooks?${query}` });
      expect(res.statusCode).toBe(200);
      const notebooks = (JSON.parse(res.body) as NotebookListBody).notebooks;
      return notebooks.map((n) => n.id).filter((id) => seededIds.has(id));
    };

    expect(await seededOrder("sort=updated&dir=asc")).toEqual([betaId, gammaId, alphaId]);
    expect(await seededOrder("sort=created&dir=asc")).toEqual([alphaId, betaId, gammaId]);
    expect(await seededOrder("sort=title&dir=asc")).toEqual([alphaId, betaId, gammaId]);
    expect(await seededOrder("sort=size&dir=asc")).toEqual([betaId, gammaId, alphaId]);
  });

  it("PATCH /api/notebooks/:id rejects an empty title with 400", async () => {
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Rename Guard Probe" },
    });
    const createdId = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/notebooks/${createdId}`,
      payload: { title: ' '.repeat(3) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/notebooks/:id/duplicate with {} defaults to 'Copy of <title>'", async () => {
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Duplication Default Probe" },
    });
    const origId = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;

    const dupRes = await app.inject({
      method: "POST",
      url: `/api/notebooks/${origId}/duplicate`,
      payload: {},
    });
    expect(dupRes.statusCode).toBe(201);
    const body = JSON.parse(dupRes.body) as NotebookBody;
    expect(body.notebook.id).not.toBe(origId);
    expect(body.notebook.title).toBe("Copy of Duplication Default Probe");
  });

  it("PATCH /api/notebooks/:id updates trashedAt (non-title path) and returns 200", async () => {
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Trash Path Probe" },
    });
    const id = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;
    const trashedAt = new Date().toISOString();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/notebooks/${id}`,
      payload: { trashedAt },
    });
    expect(patchRes.statusCode).toBe(200);
    const body = JSON.parse(patchRes.body) as NotebookBody;
    expect(body.notebook.trashedAt).toBe(trashedAt);

    // Soft-trashed notebooks drop out of the dashboard list
    const listRes = await app.inject({ method: "GET", url: "/api/notebooks" });
    const listedIds = (JSON.parse(listRes.body) as NotebookListBody).notebooks.map((n: { id: string }) => n.id);
    expect(listedIds).not.toContain(id);
  });

  it("DELETE /api/notebooks/:id removes the notebook and returns 204", async () => {
    const createdRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Deletable Probe" },
    });
    const id = (JSON.parse(createdRes.body) as NotebookBody).notebook.id;

    const deletedRes = await app.inject({
      method: "DELETE",
      url: `/api/notebooks/${id}`,
    });
    expect(deletedRes.statusCode).toBe(204);

    const fetchedRes = await app.inject({
      method: "GET",
      url: `/api/notebooks/${id}`,
    });
    expect(fetchedRes.statusCode).toBe(404);
  });

  describe("dependency handling (notebookService without notebookRepo)", () => {
    let serviceOnlyApp: FastifyInstance;

    beforeAll(async () => {
      const repo = new SqliteNotebookRepository(dbInstance.db, dbInstance.sqlite);
      serviceOnlyApp = fastify({ logger: false });
      await serviceOnlyApp.register(notebooksRoutes, {
        notebookService: new NotebookService(repo),
        defaultUserId: testUserId,
      });
      await serviceOnlyApp.ready();
    });

    afterAll(async () => {
      await serviceOnlyApp.close();
    });

    it("returns a structured 500 instead of crashing on a non-title PATCH", async () => {
      const res = await serviceOnlyApp.inject({
        method: "PATCH",
        url: "/api/notebooks/00000000-0000-4000-8000-000000000000",
        payload: { trashedAt: new Date().toISOString() },
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body) as { error?: { code?: string; message?: string } };
      expect(body.error?.code).toBe("INVARIANCE_VIOLATION");
      expect(body.error?.message ?? "").not.toContain("Cannot read properties");
    });
  });
});
