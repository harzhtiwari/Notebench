import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { createSqliteDatabase, initializeSqliteSchema, type SqliteDatabaseInstance } from "@notebook/infra-db";

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
    const body = JSON.parse(res.body);
    expect(body.notebook).toBeDefined();
    expect(body.notebook.id).toBeDefined();
    expect(body.notebook.title).toBe("Biology 101");
  });

  it("POST /api/notebooks rejects empty title with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "   " },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/notebooks lists active notebooks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/notebooks",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.notebooks)).toBe(true);
    expect(body.notebooks.some((n: { title: string }) => n.title === "Biology 101")).toBe(true);
  });

  it("PATCH /api/notebooks/:id renames notebook and returns 200", async () => {
    // Create first
    const createRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Original Name" },
    });
    const createdId = JSON.parse(createRes.body).notebook.id;

    // Rename
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/notebooks/${createdId}`,
      payload: { title: "Renamed Name" },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = JSON.parse(patchRes.body);
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
    const createRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Astrophysics" },
    });
    const origId = JSON.parse(createRes.body).notebook.id;

    const dupRes = await app.inject({
      method: "POST",
      url: `/api/notebooks/${origId}/duplicate`,
      payload: { title: "Copy of Astrophysics" },
    });

    expect(dupRes.statusCode).toBe(201);
    const body = JSON.parse(dupRes.body);
    expect(body.notebook.id).not.toBe(origId);
    expect(body.notebook.title).toBe("Copy of Astrophysics");

    // Both should exist in list
    const listRes = await app.inject({
      method: "GET",
      url: "/api/notebooks",
    });
    const list = JSON.parse(listRes.body).notebooks;
    expect(list.some((n: { id: string }) => n.id === origId)).toBe(true);
    expect(list.some((n: { id: string }) => n.id === body.notebook.id)).toBe(true);
  });

  it("GET /api/notebooks/metrics returns storage cap and counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/notebooks/metrics",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metrics).toBeDefined();
    expect(body.metrics.storageSafeCapBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(typeof body.metrics.notebookCount).toBe("number");
  });
});
