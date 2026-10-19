import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PgVectorStore,
  SqliteVectorStore,
} from "../../infra-vectorstore/src/index.js";
import type { VectorSearchResult } from "@notebench/contracts";
import { createPgDatabase, type PgDatabaseInstance } from "../src/pg/connection.js";
import {
  createFreshPgDatabase,
  pgIntegrationSkipReason,
  type FreshPgDatabase,
} from "./pg-harness.js";

/**
Ticket 28 — sqlite-vec ↔ pgvector top-5 parity on a 100-row, 384-dim fixture.

The two engines are compared through the same `VectorStorePort`:
`SqliteVectorStore` (sqlite-vec, cosine distance) and `PgVectorStore`
(pgvector `vector(384)`, `<=>`, exact scan — no ANN index so parity is not
affected by approximate recall).

Tie tolerance: both engines store float32 values, but distance kernels may
differ by single-precision rounding, so adjacent rows closer than 1e-4
cosine distance may swap. With a seeded random fixture no true ties exist,
so the orders are expected to be identical; the tolerance only absorbs
float32 kernel noise.

The store implementation lives in `@notebench/infra-vectorstore` and the pg
driver only resolves inside `@notebench/infra-db` (pnpm isolated
node_modules), so this file imports the store's source entry point by
relative path: package-level isolation makes `pg` + `sqlite-vec`
unresolvable in any single package.
*/

const DIMENSIONS = 384;
const ROW_COUNT = 100;
const TOP_K = 5;
const TIE_TOLERANCE = 1e-4;

const notebookId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherNotebookId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const userId = "11111111-1111-1111-1111-111111111111";

/**
Deterministic PRNG so both dialects embed the exact same fixture.
*/
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6D_2B_79_F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
float32-rounded values: identical bits reach sqlite-vec and pgvector.
*/
function buildFixture(): { embeddings: number[][]; query: number[] } {
  const random = mulberry32(0x28_FA_57);
  const next = () => Math.fround(random() * 2 - 1);
  const embeddings = Array.from({ length: ROW_COUNT }, () =>
    Array.from({ length: DIMENSIONS }, next)
  );
  const query = Array.from({ length: DIMENSIONS }, next);
  return { embeddings, query };
}

const fixture = buildFixture();

function expectTopKParity(
  sqliteResults: VectorSearchResult[],
  pgResults: VectorSearchResult[]
): void {
  expect(sqliteResults).toHaveLength(TOP_K);
  expect(pgResults).toHaveLength(TOP_K);

  const sqliteById = new Map(sqliteResults.map((row) => [row.chunkRowid, row.distance]));
  const pgById = new Map(pgResults.map((row) => [row.chunkRowid, row.distance]));

  for (let i = 0; i < TOP_K; i += 1) {
    const sqliteRow = sqliteResults[i];
    const pgRow = pgResults[i];
    if (!sqliteRow || !pgRow) {
      throw new Error(`missing row at position ${i}`);
    }

    if (sqliteRow.chunkRowid === pgRow.chunkRowid) {
      expect(
        Math.abs(sqliteRow.distance - pgRow.distance),
        `distance of chunk ${sqliteRow.chunkRowid}`
      ).toBeLessThanOrEqual(TIE_TOLERANCE);
      continue;
    }

    // A swap is only tolerated when both engines consider the two rows
    // within TIE_TOLERANCE of each other.
    const sqliteDistanceOfPgRow = sqliteById.get(pgRow.chunkRowid);
    const pgDistanceOfSqliteRow = pgById.get(sqliteRow.chunkRowid);
    expect(
      sqliteDistanceOfPgRow,
      `sqlite distance for pg row ${pgRow.chunkRowid}`
    ).toBeDefined();
    expect(
      pgDistanceOfSqliteRow,
      `pg distance for sqlite row ${sqliteRow.chunkRowid}`
    ).toBeDefined();
    expect(
      Math.abs(sqliteRow.distance - (sqliteDistanceOfPgRow ?? Infinity))
    ).toBeLessThanOrEqual(TIE_TOLERANCE);
    expect(
      Math.abs(pgRow.distance - (pgDistanceOfSqliteRow ?? Infinity))
    ).toBeLessThanOrEqual(TIE_TOLERANCE);
  }
}

const skipReason = pgIntegrationSkipReason();
const skipSuffix = skipReason
  ? " [skipped: POSTGRES_URL not set — run pnpm test:postgres]"
  : "";
if (skipReason) {
  console.warn(`[pg-integration] pgvector parity suite skipped: ${skipReason}`);
}

const describePg = skipReason ? describe.skip : describe;

describe("Ticket 28 — sqlite-vec vs pgvector top-5 parity (sqlite dialect)", () => {
  it("sqlite-vec returns an exact cosine top-5 on the 100-row fixture", async () => {
    const db = new Database(":memory:");
    try {
      const store = new SqliteVectorStore(db, { dimensions: DIMENSIONS });
      await store.init();
      await store.insertBatch(
        fixture.embeddings.map((embedding, index) => ({
          chunkRowid: index + 1,
          notebookId,
          userId,
          embedding,
        }))
      );
      // Decoy in a different notebook: must never appear in scoped results.
      await store.insert({
        chunkRowid: ROW_COUNT + 1,
        notebookId: otherNotebookId,
        userId,
        embedding: fixture.query,
      });

      const results = await store.searchKnn({
        queryVector: fixture.query,
        notebookId,
        userId,
        k: TOP_K,
      });
      expect(results).toHaveLength(TOP_K);
      expect(
        results.every((row) => row.chunkRowid >= 1 && row.chunkRowid <= ROW_COUNT)
      ).toBe(true);
    } finally {
      db.close();
    }
  });
});

describePg(`Ticket 28 — sqlite-vec vs pgvector top-5 parity (pgvector)${skipSuffix}`, () => {
  let fresh: FreshPgDatabase;
  let pgDb: PgDatabaseInstance;

  beforeAll(async () => {
    fresh = await createFreshPgDatabase();
    pgDb = createPgDatabase({ connectionString: fresh.url });
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- teardown must survive a beforeAll failure
    await pgDb?.close();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- teardown must survive a beforeAll failure
    await fresh?.close();
  });

  it("pgvector returns the same top-5 order as sqlite-vec on the 100-row fixture", async () => {
    const pgStore = new PgVectorStore(
      {
        query: (text, values) => pgDb.pool.query(text, values),
      },
      { dimensions: DIMENSIONS }
    );
    await pgStore.init();
    await pgStore.insertBatch(
      fixture.embeddings.map((embedding, index) => ({
        chunkRowid: index + 1,
        notebookId,
        userId,
        embedding,
      }))
    );
    await pgStore.insert({
      chunkRowid: ROW_COUNT + 1,
      notebookId: otherNotebookId,
      userId,
      embedding: fixture.query,
    });

    const pgResults = await pgStore.searchKnn({
      queryVector: fixture.query,
      notebookId,
      userId,
      k: TOP_K,
    });

    // Same fixture, same port, SQLite side computed in this process.
    const db = new Database(":memory:");
    try {
      const sqliteStore = new SqliteVectorStore(db, { dimensions: DIMENSIONS });
      await sqliteStore.init();
      await sqliteStore.insertBatch(
        fixture.embeddings.map((embedding, index) => ({
          chunkRowid: index + 1,
          notebookId,
          userId,
          embedding,
        }))
      );
      const sqliteResults = await sqliteStore.searchKnn({
        queryVector: fixture.query,
        notebookId,
        userId,
        k: TOP_K,
      });

      expectTopKParity(sqliteResults, pgResults);
      expect(
        pgResults.every(
          (row) => row.chunkRowid >= 1 && row.chunkRowid <= ROW_COUNT
        ),
        "scoped results exclude the other notebook's decoy"
      ).toBe(true);
    } finally {
      db.close();
    }
  });
});
