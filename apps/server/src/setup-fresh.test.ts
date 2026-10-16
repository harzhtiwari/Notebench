import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createSqliteDatabase, initializeSqliteSchema, type SqliteDatabaseInstance } from "@notebook/infra-db";
import { buildServer } from "./app.js";

describe("Fresh boot must not fake an owner (Ticket 01 vs 05)", () => {
  let app: FastifyInstance | undefined;
  let dbInstance: SqliteDatabaseInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (dbInstance) {
      dbInstance.close();
      dbInstance = undefined;
    }
  });

  it("fresh :memory: DB reports setupComplete=false and setup creates the real owner", async () => {
    dbInstance = createSqliteDatabase({ dbPath: ":memory:" });
    initializeSqliteSchema(dbInstance.sqlite);

    app = await buildServer({ db: dbInstance, logger: false });
    await app.ready();

    const stateRes = await app.inject({ method: "GET", url: "/api/app-state" });
    expect(stateRes.statusCode).toBe(200);
    const state = JSON.parse(stateRes.body);
    expect(state.setupComplete).toBe(false);

    const preSetupNotebooks = await app.inject({ method: "GET", url: "/api/notebooks" });
    expect(preSetupNotebooks.statusCode).toBe(409);

    const setupRes = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { displayName: "Fresh Owner" },
    });
    expect(setupRes.statusCode).toBe(201);
    const ownerId = JSON.parse(setupRes.body).owner.id as string;
    expect(typeof ownerId).toBe("string");

    const secondSetup = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { displayName: "Intruder" },
    });
    expect(secondSetup.statusCode).toBe(409);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/notebooks",
      payload: { title: "Real Owner Notebook" },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/api/notebooks" });
    expect(listRes.statusCode).toBe(200);
    const notebooks = JSON.parse(listRes.body).notebooks as Array<{ title: string }>;
    expect(notebooks.some((n) => n.title === "Real Owner Notebook")).toBe(true);
  });
});
