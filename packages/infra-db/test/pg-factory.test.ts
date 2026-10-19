import Database from "better-sqlite3";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializePgSchema } from "../src/pg/bootstrap.js";
import {
  createPgDatabase,
  type PgDatabaseInstance,
} from "../src/pg/connection.js";
import { pgSchema } from "../src/schema/index.js";
import { initializeSqliteSchema } from "../src/sqlite/notebook-repository.js";
import { migrateModelSelectionsTable } from "../src/sqlite/model-selection-repository.js";
import { migrateVaultKeysTable } from "../src/sqlite/vault-key-repository.js";
import { runPgMigrations } from "../src/migrator/runner.js";
import {
  createFreshPgDatabase,
  pgIntegrationSkipReason,
  type FreshPgDatabase,
} from "./pg-harness.js";

/**
Ticket 28 — `createPgDatabase` against a real Postgres.

Needs POSTGRES_URL (`pnpm test:postgres`); skips cleanly without it. Each
harness instance gets a brand-new empty database, so "the migrator applies
to an empty Postgres database" is proven literally, and the live schema is
compared against both the declared pg schema and the runtime SQLite
bootstrap.
*/

const skipReason = pgIntegrationSkipReason();
const skipSuffix = skipReason
  ? " [skipped: POSTGRES_URL not set — run pnpm test:postgres]"
  : "";
if (skipReason) {
  console.warn(`[pg-integration] Postgres factory suite skipped: ${skipReason}`);
}

const describePg = skipReason ? describe.skip : describe;

/**
Code-unit string ordering — matches the default `Array#sort()` comparator.
*/
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : (a > b ? 1 : 0);
}

describePg(
  `Ticket 28 — PostgreSQL factory, migrator, and schema parity (integration)${skipSuffix}`,
  () => {
  let fresh: FreshPgDatabase;
  let pgDb: PgDatabaseInstance;

  beforeAll(async () => {
    fresh = await createFreshPgDatabase();
    pgDb = createPgDatabase({ connectionString: fresh.url });
    await runPgMigrations({ pool: pgDb.pool, migrationFn: initializePgSchema });
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- teardown must survive a beforeAll failure
    await pgDb?.close();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- teardown must survive a beforeAll failure
    await fresh?.close();
  });

  it("connects through createPgDatabase to a real Postgres (SELECT 1)", async () => {
    const probe = await pgDb.pool.query<{ ok: number }>("SELECT 1 AS ok");
    expect(probe.rows[0]?.ok).toBe(1);
  });

  it("applies the schema to an empty database via runPgMigrations and is idempotent", async () => {
    const empty = await createFreshPgDatabase();
    const target = createPgDatabase({ connectionString: empty.url });
    try {
      const before = await target.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`
      );
      expect(Number(before.rows[0]?.n)).toBe(0);

      const first = await runPgMigrations({
        pool: target.pool,
        migrationFn: initializePgSchema,
      });
      expect(first.success).toBe(true);

      // IF NOT EXISTS DDL: a second run over the existing schema must succeed.
      const second = await runPgMigrations({
        pool: target.pool,
        migrationFn: initializePgSchema,
      });
      expect(second.success).toBe(true);

      // Every declared pg table exists, with every declared column.
      const liveTables = await target.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      );
      expect(liveTables.rows.map((row) => row.table_name).toSorted(compareCodeUnits)).toEqual(
        Object.keys(pgSchema).toSorted(compareCodeUnits)
      );

      for (const tableName of Object.keys(pgSchema)) {
        const table = pgSchema[tableName as keyof typeof pgSchema];
        const config = getPgTableConfig(table);
        const declared = config.columns.map((column) => column.name).toSorted(compareCodeUnits);
        const live = await target.pool.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [config.name]
        );
        expect(
          live.rows.map((row) => row.column_name).toSorted(compareCodeUnits),
          `columns of ${tableName}`
        ).toEqual(declared);
      }
    } finally {
      await target.close();
      await empty.close();
    }
  });

  it("enforces the provider_model_selections (user_id, kind) unique index", async () => {
    const indexRow = await pgDb.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'provider_model_selections'`
    );
    expect(indexRow.rows.map((row) => row.indexname)).toContain(
      "provider_model_selections_user_kind"
    );

    await pgDb.pool.query(
      `INSERT INTO users (id, role, created_at, updated_at) VALUES ($1, 'owner', now(), now())`,
      ["11111111-1111-1111-1111-111111111111"]
    );
    await pgDb.pool.query(
      `INSERT INTO provider_model_selections (id, user_id, kind, provider, model_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'chat', 'openai', 'gpt-5', now(), now())`,
      ["11111111-1111-1111-1111-111111111111"]
    );

    await expect(
      pgDb.pool.query(
        `INSERT INTO provider_model_selections (id, user_id, kind, provider, model_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'chat', 'anthropic', 'claude-sonnet-4-5', now(), now())`,
        ["11111111-1111-1111-1111-111111111111"]
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint/);

    // A different kind for the same user stays allowed.
    await pgDb.pool.query(
      `INSERT INTO provider_model_selections (id, user_id, kind, provider, model_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'embedding', 'openai', 'text-embedding-3-small', now(), now())`,
      ["11111111-1111-1111-1111-111111111111"]
    );
  });

  it("matches the runtime SQLite bootstrap on table and named-index sets", async () => {
    const sqlite = new Database(":memory:");
    try {
      initializeSqliteSchema(sqlite);
      migrateVaultKeysTable(sqlite);
      migrateModelSelectionsTable(sqlite);

      const sqliteTables = (
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
          )
          .all() as { name: string }[]
      ).map((row) => row.name);
      const pgTables = await pgDb.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      );
      expect(pgTables.rows.map((row) => row.table_name)).toEqual(sqliteTables);

      // Ticket 20 records the deletion gate on SQLite; the same table is
      // present here, so the Postgres side of that gate is covered.
      expect(sqliteTables).toContain("deletion_jobs");

      const sqliteIndexes = (
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`
          )
          .all() as { name: string }[]
      ).map((row) => row.name);
      const pgIndexes = await pgDb.pool.query<{ indexname: string }>(
        String.raw`SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname NOT LIKE '%\_pkey' ORDER BY indexname`
      );
      expect(pgIndexes.rows.map((row) => row.indexname)).toEqual(sqliteIndexes);
      expect(sqliteIndexes).toContain("provider_model_selections_user_kind");
    } finally {
      sqlite.close();
    }
  });
});
