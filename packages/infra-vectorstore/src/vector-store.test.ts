import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {
  toVectorBlob,
  sanitizeFtsQuery,
  SqliteVectorStore,
  SqliteFtsStore,
} from "./index.js";

describe("SqliteVectorStore & SqliteFtsStore (Ticket #15 - RED phase)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("toVectorBlob", () => {
    it("converts number array to Float32 Buffer", () => {
      const arr = [0.1, 0.2, 0.3];
      const buf = toVectorBlob(arr);

      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.byteLength).toBe(12); // 3 * 4 bytes

      const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      expect(f32[0]).toBeCloseTo(0.1);
      expect(f32[1]).toBeCloseTo(0.2);
      expect(f32[2]).toBeCloseTo(0.3);
    });

    it("converts Float32Array to Buffer preserving byte offsets", () => {
      const f32 = new Float32Array([1.0, -1.0, 0.5]);
      const buf = toVectorBlob(f32);

      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.byteLength).toBe(12);
    });
  });

  describe("sanitizeFtsQuery", () => {
    it("sanitizes queries containing special FTS5 operators without crashing", () => {
      const dirty = 'quantum "computing" AND (entanglement OR *gate) -noise:1';
      const clean = sanitizeFtsQuery(dirty);

      expect(clean).toBeDefined();
      expect(clean.length).toBeGreaterThan(0);
      // Clean query should not crash FTS MATCH
      db.exec(`
        CREATE VIRTUAL TABLE fts_test USING fts5(content, tokenize='unicode61 remove_diacritics 2');
        INSERT INTO fts_test(content) VALUES ('quantum computing and entanglement');
      `);
      const stmt = db.prepare("SELECT * FROM fts_test WHERE fts_test MATCH ?");
      expect(() => stmt.all(clean)).not.toThrow();
    });

    it("returns empty string for empty or whitespace query", () => {
      expect(sanitizeFtsQuery("")).toBe("");
      expect(sanitizeFtsQuery("   ")).toBe("");
    });
  });

  describe("SqliteVectorStore (vec0 virtual table)", () => {
    it("creates vec0 table, inserts embeddings, and searches KNN strictly scoped to notebook_id and user_id", async () => {
      const store = new SqliteVectorStore(db, { dimensions: 4 });
      await store.init();

      const userA = "11111111-1111-1111-1111-111111111111";
      const userB = "22222222-2222-2222-2222-222222222222";
      const notebookA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const notebookB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

      // Insert vectors
      await store.insert({
        chunkRowid: 1,
        notebookId: notebookA,
        userId: userA,
        embedding: [1, 0, 0, 0], // Exact match for target
      });

      await store.insert({
        chunkRowid: 2,
        notebookId: notebookA,
        userId: userA,
        embedding: [0, 1, 0, 0], // Orthogonal
      });

      // Target vector in different notebook (must be filtered out)
      await store.insert({
        chunkRowid: 3,
        notebookId: notebookB,
        userId: userA,
        embedding: [1, 0, 0, 0],
      });

      // Target vector in different user (must be filtered out)
      await store.insert({
        chunkRowid: 4,
        notebookId: notebookA,
        userId: userB,
        embedding: [1, 0, 0, 0],
      });

      const results = await store.searchKnn({
        queryVector: [1, 0, 0, 0],
        notebookId: notebookA,
        userId: userA,
        k: 10,
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.chunkRowid).toBe(1);
      expect(results[0]?.distance).toBeCloseTo(0.0, 3);
      expect(results[1]?.chunkRowid).toBe(2);
    });

    it("deletes vectors strictly scoped to notebookId", async () => {
      const store = new SqliteVectorStore(db, { dimensions: 4 });
      await store.init();

      const notebookA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const notebookB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      const userA = "11111111-1111-1111-1111-111111111111";

      await store.insert({
        chunkRowid: 1,
        notebookId: notebookA,
        userId: userA,
        embedding: [1, 0, 0, 0],
      });

      await store.insert({
        chunkRowid: 2,
        notebookId: notebookB,
        userId: userA,
        embedding: [1, 0, 0, 0],
      });

      await store.deleteByNotebookId(notebookA);

      const remainingA = await store.searchKnn({
        queryVector: [1, 0, 0, 0],
        notebookId: notebookA,
        userId: userA,
        k: 10,
      });
      expect(remainingA).toHaveLength(0);

      const remainingB = await store.searchKnn({
        queryVector: [1, 0, 0, 0],
        notebookId: notebookB,
        userId: userA,
        k: 10,
      });
      expect(remainingB).toHaveLength(1);
    });
  });

  describe("SqliteFtsStore (unicode61 remove_diacritics 2)", () => {
    it("creates FTS5 table, indexes content, and matches text scoped to notebook_id and user_id", async () => {
      const fts = new SqliteFtsStore(db);
      await fts.init();

      const userA = "11111111-1111-1111-1111-111111111111";
      const notebookA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const notebookB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

      await fts.insert({
        chunkRowid: 10,
        notebookId: notebookA,
        userId: userA,
        content: "Distributed relational storage with write-ahead logging",
      });

      await fts.insert({
        chunkRowid: 20,
        notebookId: notebookB,
        userId: userA,
        content: "Distributed relational storage in other notebook",
      });

      const hits = await fts.search({
        query: "relational logging",
        notebookId: notebookA,
        userId: userA,
        limit: 10,
      });

      expect(hits).toHaveLength(1);
      expect(hits[0]?.chunkRowid).toBe(10);
      expect(hits[0]?.rank).toBeDefined();
    });

    it("deletes all chunks belonging to a notebook during cascading deletion", async () => {
      const fts = new SqliteFtsStore(db, "fts_cascading_test");
      await fts.init();

      const user = "11111111-1111-1111-1111-111111111111";
      const notebookA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const notebookB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

      await fts.insert({
        chunkRowid: 1,
        notebookId: notebookA,
        userId: user,
        content: "Unique content in notebook A",
      });

      await fts.insert({
        chunkRowid: 2,
        notebookId: notebookB,
        userId: user,
        content: "Unique content in notebook B",
      });

      await fts.deleteByNotebookId(notebookA);

      const hitsA = await fts.search({
        query: "Unique content",
        notebookId: notebookA,
        userId: user,
        limit: 10,
      });
      expect(hitsA).toHaveLength(0);

      const hitsB = await fts.search({
        query: "Unique content",
        notebookId: notebookB,
        userId: user,
        limit: 10,
      });
      expect(hitsB).toHaveLength(1);
    });
  });
});
