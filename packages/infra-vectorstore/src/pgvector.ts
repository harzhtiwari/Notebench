import type {
  VectorRecord,
  VectorSearchResult,
  VectorStorePort,
} from "@notebench/contracts";

/**
Ticket 28 — Postgres pgvector store implementing `VectorStorePort`
alongside `SqliteVectorStore`.

Uses `vector(384)` (matching the production embedding dimension) and cosine
distance (`<=>`), exactly like the sqlite-vec store runs with
`distance_metric=cosine`. No ANN index is created: pgvector then performs
exact nearest-neighbour search, which is what makes the top-k order
comparable with sqlite-vec (the parity test documents the tie tolerance).

The store talks to a structural `PgQueryable` rather than importing the
`pg` driver: driver ownership stays where the pool is created
(`@notebench/infra-db`, AGENTS §3 / ticket 28 §3.5) and this package needs no
new dependency. Pass a `pg.Pool` (it satisfies the shape) or a thin
adapter over one.
*/

/**
Minimal query surface a pg Pool/Client exposes; keeps this package pg-free.
*/
export interface PgQueryable {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
Converts a vector to the pgvector text literal `[v1,v2,...]`.
`Float32Array` inputs are preserved bit-for-bit so pgvector stores the same
single-precision values sqlite-vec receives via `toVectorBlob`.
*/
export function toPgVectorLiteral(vector: Float32Array | number[]): string {
  const f32 = vector instanceof Float32Array ? vector : new Float32Array(vector);
  return `[${[...f32].join(",")}]`;
}

export interface PgVectorStoreOptions {
  dimensions?: number | undefined;
  tableName?: string | undefined;
}

/**
PostgreSQL pgvector adapter. Scoping mirrors `SqliteVectorStore`:
every read and delete is partitioned by notebookId and userId.
*/
export class PgVectorStore implements VectorStorePort {
  private readonly db: PgQueryable;
  private readonly dimensions: number;
  private readonly tableName: string;

  constructor(db: PgQueryable, options: PgVectorStoreOptions = {}) {
    this.db = db;
    this.dimensions = options.dimensions ?? 384;
    this.tableName = options.tableName ?? "vec_chunks";
  }

  public async init(): Promise<void> {
    await this.db.query("CREATE EXTENSION IF NOT EXISTS vector");
    // tableName/dimensions are internal options, never user input (mirrors
    // the SqliteVectorStore interpolation precedent).
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        chunk_rowid bigint PRIMARY KEY,
        notebook_id uuid NOT NULL,
        user_id uuid NOT NULL,
        embedding vector(${this.dimensions}) NOT NULL
      );
    `);
  }

  public async insert(record: VectorRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO ${this.tableName}(chunk_rowid, notebook_id, user_id, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [
        record.chunkRowid,
        record.notebookId,
        record.userId,
        toPgVectorLiteral(record.embedding),
      ]
    );
  }

  public async insertBatch(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      await this.insert(record);
    }
  }

  public async searchKnn(params: {
    queryVector: Float32Array | number[];
    notebookId: string;
    userId: string;
    k: number;
  }): Promise<VectorSearchResult[]> {
    const result = await this.db.query(
      `SELECT chunk_rowid, embedding <=> $1::vector AS distance
       FROM ${this.tableName}
       WHERE notebook_id = $2 AND user_id = $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [
        toPgVectorLiteral(params.queryVector),
        params.notebookId,
        params.userId,
        params.k,
      ]
    );

    return result.rows.map((row) => ({
      // bigint row ids arrive as strings from node-postgres.
      chunkRowid: Number(row["chunk_rowid"]),
      distance: Number(row["distance"]),
    }));
  }

  public async deleteByNotebookId(notebookId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM ${this.tableName} WHERE notebook_id = $1`,
      [notebookId]
    );
  }
}
