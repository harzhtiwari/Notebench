import type Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
export * from "./pgvector.js";
import type {
  VectorRecord,
  VectorSearchResult,
  VectorStorePort,
  FtsSearchResult,
  FtsStorePort,
} from "@notebench/contracts";

/**
Converts a Float32Array or number array to a Node.js Buffer for better-sqlite3 vector binding.
Required because better-sqlite3 cannot bind raw Float32Array directly.
*/
export function toVectorBlob(vector: Float32Array | number[]): Buffer {
  const f32 = vector instanceof Float32Array ? vector : new Float32Array(vector);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
Sanitizes user query text into safe FTS5 prefix match tokens.
Strips special boolean operators and punctuation to avoid syntax errors.
*/
export function sanitizeFtsQuery(rawQuery: string): string {
  if (rawQuery.trim().length === 0) {
    return "";
  }

  const tokens = rawQuery
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token}"*`);

  return tokens.join(" ");
}

export interface SqliteVectorStoreOptions {
  dimensions?: number | undefined;
  tableName?: string | undefined;
}

/**
SQLite sqlite-vec vec0 Virtual Table Adapter.
Cosine distance vector search partitioned by notebookId and userId.
Note: better-sqlite3 requires primary key integers on vec0 to be passed as BigInt.
*/
export class SqliteVectorStore implements VectorStorePort {
  private readonly db: Database.Database;
  private readonly dimensions: number;
  private readonly tableName: string;

  constructor(db: Database.Database, options: SqliteVectorStoreOptions = {}) {
    this.db = db;
    this.dimensions = options.dimensions ?? 384;
    this.tableName = options.tableName ?? "vec_chunks";
  }

  public init(): Promise<void> {
    sqliteVec.load(this.db);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING vec0(
        chunk_rowid INTEGER PRIMARY KEY,
        notebook_id TEXT,
        user_id TEXT,
        embedding FLOAT[${this.dimensions}] distance_metric=cosine
      );
    `);
    return Promise.resolve();
  }

  public insert(record: VectorRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName}(chunk_rowid, notebook_id, user_id, embedding)
      VALUES (?, ?, ?, ?)
    `);
    const blob = toVectorBlob(record.embedding);
    // Explicit BigInt conversion satisfies sqlite-vec strict integer PK check
    stmt.run(BigInt(record.chunkRowid), record.notebookId, record.userId, blob);
    return Promise.resolve();
  }

  public insertBatch(records: VectorRecord[]): Promise<void> {
    const insertMany = this.db.transaction((items: VectorRecord[]) => {
      const stmt = this.db.prepare(`
        INSERT INTO ${this.tableName}(chunk_rowid, notebook_id, user_id, embedding)
        VALUES (?, ?, ?, ?)
      `);
      for (const item of items) {
        const blob = toVectorBlob(item.embedding);
        stmt.run(BigInt(item.chunkRowid), item.notebookId, item.userId, blob);
      }
    });
    insertMany(records);
    return Promise.resolve();
  }

  public searchKnn(params: {
    queryVector: Float32Array | number[];
    notebookId: string;
    userId: string;
    k: number;
  }): Promise<VectorSearchResult[]> {
    const blob = toVectorBlob(params.queryVector);
    const stmt = this.db.prepare(`
      SELECT chunk_rowid, distance
      FROM ${this.tableName}
      WHERE embedding MATCH ?
        AND notebook_id = ?
        AND user_id = ?
        AND k = ?
    `);
    const rows = stmt.all(blob, params.notebookId, params.userId, params.k) as {
      chunk_rowid: number | bigint;
      distance: number | null;
    }[];
    return Promise.resolve(
      rows.map((r) => ({
        chunkRowid: Number(r.chunk_rowid),
        distance: r.distance ?? 0,
      }))
    );
  }

  public deleteByNotebookId(notebookId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM ${this.tableName}
      WHERE notebook_id = ?
    `);
    stmt.run(notebookId);
    return Promise.resolve();
  }
}

export interface FtsRecord {
  chunkRowid: number;
  notebookId: string;
  userId: string;
  content: string;
}

/**
SQLite FTS5 Full-Text Search Store.
Configured with unicode61 remove_diacritics 2 tokenizer.
*/
export class SqliteFtsStore implements FtsStorePort {
  private readonly db: Database.Database;
  private readonly tableName: string;

  constructor(db: Database.Database, tableName = "fts_chunks") {
    this.db = db;
    this.tableName = tableName;
  }

  public init(): Promise<void> {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING fts5(
        chunk_rowid UNINDEXED,
        notebook_id UNINDEXED,
        user_id UNINDEXED,
        content,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    return Promise.resolve();
  }

  public insert(record: FtsRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName}(chunk_rowid, notebook_id, user_id, content)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(record.chunkRowid, record.notebookId, record.userId, record.content);
    return Promise.resolve();
  }

  public search(params: {
    query: string;
    notebookId: string;
    userId: string;
    limit: number;
  }): Promise<FtsSearchResult[]> {
    const sanitized = sanitizeFtsQuery(params.query);
    if (!sanitized) {
      return Promise.resolve([]);
    }

    const stmt = this.db.prepare(`
      SELECT chunk_rowid, rank, snippet(${this.tableName}, 3, '<mark>', '</mark>', '...', 16) AS snippet
      FROM ${this.tableName}
      WHERE ${this.tableName} MATCH ?
        AND notebook_id = ?
        AND user_id = ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    const rows = stmt.all(sanitized, params.notebookId, params.userId, params.limit) as {
      chunk_rowid: number | bigint;
      rank: number;
      snippet: string;
    }[];

    return Promise.resolve(
      rows.map((r) => ({
        chunkRowid: Number(r.chunk_rowid),
        rank: r.rank,
        snippet: r.snippet,
      }))
    );
  }

  public deleteByNotebookId(notebookId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM ${this.tableName}
      WHERE notebook_id = ?
    `);
    stmt.run(notebookId);
    return Promise.resolve();
  }
}

