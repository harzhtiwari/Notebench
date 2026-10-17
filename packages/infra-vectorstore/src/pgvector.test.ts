import { describe, expect, it } from "vitest";
import { PgVectorStore, toPgVectorLiteral } from "./pgvector.js";
import type { PgQueryable } from "./pgvector.js";

/**
 * Unit tests for the Postgres vector store. These run without a database:
 * the store talks to a structural `PgQueryable`, and this suite records the
 * SQL and parameters it emits (the real end-to-end proof lives in
 * `packages/infra-db/test/pgvector-parity.test.ts`, which needs Docker).
 */

interface RecordedQuery {
  text: string;
  values: unknown[] | undefined;
}

function recordingQueryable(
  rowsByCall: Array<Array<Record<string, unknown>>> = []
): { queryable: PgQueryable; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  const queryable: PgQueryable = {
    query: (text, values) => {
      calls.push({ text, values });
      const rows = rowsByCall[calls.length - 1] ?? [];
      return Promise.resolve({ rows });
    },
  };
  return { queryable, calls };
}

describe("toPgVectorLiteral", () => {
  it("formats a number array as a pgvector literal", () => {
    expect(toPgVectorLiteral([1, 0.5, -2, 0.25])).toBe("[1,0.5,-2,0.25]");
  });

  it("formats a Float32Array with single-precision values, matching sqlite-vec f32 storage", () => {
    const literal = toPgVectorLiteral(new Float32Array([0.1, 0.2]));
    expect(literal).toBe(`[${Array.from(new Float32Array([0.1, 0.2])).join(",")}]`);
    expect(literal).not.toBe("[0.1,0.2]");
  });
});

describe("PgVectorStore SQL emission", () => {
  const notebookId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userId = "11111111-1111-1111-1111-111111111111";

  it("init creates the pgvector extension and a vector(384) column", async () => {
    const { queryable, calls } = recordingQueryable();
    await new PgVectorStore(queryable).init();

    expect(calls[0]?.text).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(calls[1]?.text).toContain("vector(384)");
    expect(calls[1]?.text).toContain("vec_chunks");
  });

  it("insert binds the embedding as a $n::vector literal", async () => {
    const { queryable, calls } = recordingQueryable();
    await new PgVectorStore(queryable).insert({
      chunkRowid: 7,
      notebookId,
      userId,
      embedding: [0, 1],
    });

    expect(calls[0]?.text).toContain("INSERT INTO vec_chunks");
    expect(calls[0]?.text).toContain("$4::vector");
    expect(calls[0]?.values).toEqual([7, notebookId, userId, "[0,1]"]);
  });

  it("searchKnn orders by cosine distance (<=>) scoped to notebook and user", async () => {
    const { queryable, calls } = recordingQueryable([
      [{ chunk_rowid: "3", distance: 0.125 }],
    ]);
    const results = await new PgVectorStore(queryable).searchKnn({
      queryVector: [1, 0],
      notebookId,
      userId,
      k: 5,
    });

    const sql = calls[0]?.text ?? "";
    expect(sql).toContain("embedding <=> $1::vector");
    expect(sql).toContain("ORDER BY embedding <=> $1::vector");
    expect(sql).toContain("WHERE notebook_id = $2 AND user_id = $3");
    expect(sql).toContain("LIMIT $4");
    expect(calls[0]?.values).toEqual(["[1,0]", notebookId, userId, 5]);
    // bigint row ids and float8 distances arrive as strings/numbers; both are
    // normalised to numbers.
    expect(results).toEqual([{ chunkRowid: 3, distance: 0.125 }]);
  });

  it("deleteByNotebookId deletes only the addressed notebook", async () => {
    const { queryable, calls } = recordingQueryable();
    await new PgVectorStore(queryable).deleteByNotebookId(notebookId);

    expect(calls[0]?.text).toContain("DELETE FROM vec_chunks WHERE notebook_id = $1");
    expect(calls[0]?.values).toEqual([notebookId]);
  });
});
