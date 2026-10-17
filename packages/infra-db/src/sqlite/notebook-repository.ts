import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  type Notebook,
  type NotebookSummary,
  type CreateNotebookInput,
  type UpdateNotebookInput,
  type DuplicateNotebookInput,
  type DashboardMetrics,
  type NotebookRepositoryPort,
  NotFoundError,
} from "@notebench/contracts";
import { sqliteSchema } from "../schema/index.js";

/**
 * Initializes the SQLite tables if they do not exist.
 */
export function initializeSqliteSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      display_name TEXT,
      passcode_hash TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      trashed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      content_hash TEXT,
      token_count INTEGER,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      current_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifact_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      model TEXT,
      instruction TEXT,
      parent_version_id TEXT,
      content TEXT NOT NULL,
      content_digest TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      last_active_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deletion_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      freed_bytes INTEGER,
      deleted_counts TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS memory_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
      rule_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      key_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      masked_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export class SqliteNotebookRepository implements NotebookRepositoryPort {
  private readonly db: BetterSQLite3Database<typeof sqliteSchema>;
  private readonly sqlite: Database.Database;

  constructor(
    db: BetterSQLite3Database<typeof sqliteSchema>,
    sqlite: Database.Database
  ) {
    this.db = db;
    this.sqlite = sqlite;
  }

  public async findById(id: string, userId: string): Promise<Notebook | null> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.notebooks)
      .where(
        and(
          eq(sqliteSchema.notebooks.id, id),
          eq(sqliteSchema.notebooks.userId, userId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      trashedAt: row.trashedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async create(userId: string, input: CreateNotebookInput): Promise<Notebook> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(sqliteSchema.notebooks).values({
      id,
      userId,
      title: input.title,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      userId,
      title: input.title,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async update(
    id: string,
    userId: string,
    input: UpdateNotebookInput
  ): Promise<Notebook> {
    const existing = await this.findById(id, userId);
    if (!existing) {
      throw new NotFoundError(`Notebook '${id}' not found`);
    }

    const now = new Date().toISOString();
    const updateValues: Partial<typeof sqliteSchema.notebooks.$inferInsert> = {
      updatedAt: now,
    };

    if (input.title !== undefined) {
      updateValues.title = input.title;
    }

    if (input.trashedAt !== undefined) {
      updateValues.trashedAt = input.trashedAt;
    }

    await this.db
      .update(sqliteSchema.notebooks)
      .set(updateValues)
      .where(
        and(
          eq(sqliteSchema.notebooks.id, id),
          eq(sqliteSchema.notebooks.userId, userId)
        )
      );

    return {
      id,
      userId,
      title: input.title !== undefined ? input.title : existing.title,
      trashedAt: input.trashedAt !== undefined ? input.trashedAt : existing.trashedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  public async delete(id: string, userId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.notebooks)
      .where(
        and(
          eq(sqliteSchema.notebooks.id, id),
          eq(sqliteSchema.notebooks.userId, userId)
        )
      );
  }

  public async listSummaries(userId: string): Promise<NotebookSummary[]> {
    const notebookRows = await this.db
      .select()
      .from(sqliteSchema.notebooks)
      .where(
        and(
          eq(sqliteSchema.notebooks.userId, userId),
          isNull(sqliteSchema.notebooks.trashedAt)
        )
      )
      .orderBy(sql`${sqliteSchema.notebooks.updatedAt} DESC`);

    if (notebookRows.length === 0) {
      return [];
    }

    const summaries: NotebookSummary[] = [];

    for (const nb of notebookRows) {
      // Aggregate sources for this notebook
      const sourceRows = this.sqlite
        .prepare(`
          SELECT title, byte_size, file_path 
          FROM sources 
          WHERE notebook_id = ? AND user_id = ?
        `)
        .all(nb.id, userId) as Array<{
          title: string;
          byte_size: number | null;
          file_path: string | null;
        }>;

      // Count artifacts for this notebook
      const artifactCountRow = this.sqlite
        .prepare(`
          SELECT COUNT(*) as count 
          FROM artifacts 
          WHERE notebook_id = ? AND user_id = ?
        `)
        .get(nb.id, userId) as { count: number };

      let storageBytes = 0;
      const sourceFileNames: string[] = [];

      for (const src of sourceRows) {
        if (src.byte_size) {
          storageBytes += src.byte_size;
        }
        if (src.title) {
          sourceFileNames.push(src.title);
        }
      }

      summaries.push({
        id: nb.id,
        userId: nb.userId,
        title: nb.title,
        trashedAt: nb.trashedAt ?? null,
        createdAt: nb.createdAt,
        updatedAt: nb.updatedAt,
        sourcesCount: sourceRows.length,
        artifactsCount: artifactCountRow ? Number(artifactCountRow.count) : 0,
        storageBytes,
        sourceFileNames,
      });
    }

    return summaries;
  }

  public async duplicate(
    sourceNotebookId: string,
    userId: string,
    input?: DuplicateNotebookInput
  ): Promise<Notebook> {
    const original = await this.findById(sourceNotebookId, userId);
    if (!original) {
      throw new NotFoundError(`Source notebook '${sourceNotebookId}' not found`);
    }

    const newTitle = input?.title ?? `Copy of ${original.title}`;
    const duplicateSources = input?.duplicateSources ?? true;
    const duplicateArtifacts = input?.duplicateArtifacts ?? true;

    // Use repository's create method (Decision / reuse rule)
    const newNotebook = await this.create(userId, { title: newTitle });
    const now = new Date().toISOString();

    if (duplicateSources) {
      const sourceRows = this.sqlite
        .prepare(`SELECT * FROM sources WHERE notebook_id = ? AND user_id = ?`)
        .all(sourceNotebookId, userId) as Array<{
          id: string;
          title: string;
          type: string;
          url: string | null;
          file_path: string | null;
          mime_type: string | null;
          byte_size: number | null;
          content_hash: string | null;
          token_count: number | null;
          summary: string | null;
        }>;

      for (const src of sourceRows) {
        const newSourceId = randomUUID();
        this.sqlite
          .prepare(`
            INSERT INTO sources (
              id, user_id, notebook_id, title, type, url, file_path, 
              mime_type, byte_size, content_hash, token_count, summary, 
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            newSourceId,
            userId,
            newNotebook.id,
            src.title,
            src.type,
            src.url,
            src.file_path,
            src.mime_type,
            src.byte_size,
            src.content_hash,
            src.token_count,
            src.summary,
            now,
            now
          );
      }
    }

    if (duplicateArtifacts) {
      const artifactRows = this.sqlite
        .prepare(`SELECT * FROM artifacts WHERE notebook_id = ? AND user_id = ?`)
        .all(sourceNotebookId, userId) as Array<{
          id: string;
          type: string;
          title: string;
          schema_version: number;
          current_version_id: string | null;
        }>;

      for (const art of artifactRows) {
        const newArtifactId = randomUUID();

        // Find versions for original artifact
        const versionRows = this.sqlite
          .prepare(`SELECT * FROM artifact_versions WHERE artifact_id = ? AND user_id = ?`)
          .all(art.id, userId) as Array<{
            id: string;
            number: number;
            created_by: string;
            model: string | null;
            instruction: string | null;
            parent_version_id: string | null;
            content: string;
            content_digest: string | null;
          }>;

        let newCurrentVersionId: string | null = null;
        const versionIdMap = new Map<string, string>();

        // First pass: assign new IDs
        for (const ver of versionRows) {
          const newVerId = randomUUID();
          versionIdMap.set(ver.id, newVerId);
          if (art.current_version_id === ver.id) {
            newCurrentVersionId = newVerId;
          }
        }

        // Insert artifact
        this.sqlite
          .prepare(`
            INSERT INTO artifacts (
              id, user_id, notebook_id, type, title, 
              schema_version, current_version_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            newArtifactId,
            userId,
            newNotebook.id,
            art.type,
            art.title,
            art.schema_version,
            newCurrentVersionId,
            now,
            now
          );

        // Insert versions
        for (const ver of versionRows) {
          const newVerId = versionIdMap.get(ver.id)!;
          const newParentId = ver.parent_version_id
            ? versionIdMap.get(ver.parent_version_id) ?? null
            : null;

          this.sqlite
            .prepare(`
              INSERT INTO artifact_versions (
                id, user_id, artifact_id, number, created_by, 
                model, instruction, parent_version_id, content, 
                content_digest, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              newVerId,
              userId,
              newArtifactId,
              ver.number,
              ver.created_by,
              ver.model,
              ver.instruction,
              newParentId,
              ver.content,
              ver.content_digest,
              now
            );
        }
      }
    }

    return newNotebook;
  }

  public async getMetrics(userId: string): Promise<DashboardMetrics> {
    const notebookCountRow = this.sqlite
      .prepare(`
        SELECT COUNT(*) as count 
        FROM notebooks 
        WHERE user_id = ? AND trashed_at IS NULL
      `)
      .get(userId) as { count: number };

    const sourceMetricsRow = this.sqlite
      .prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(s.byte_size), 0) as total_bytes
        FROM sources s
        JOIN notebooks n ON s.notebook_id = n.id
        WHERE s.user_id = ? AND n.trashed_at IS NULL
      `)
      .get(userId) as { count: number; total_bytes: number };

    const artifactCountRow = this.sqlite
      .prepare(`
        SELECT COUNT(*) as count 
        FROM artifacts a
        JOIN notebooks n ON a.notebook_id = n.id
        WHERE a.user_id = ? AND n.trashed_at IS NULL
      `)
      .get(userId) as { count: number };

    return {
      notebookCount: Number(notebookCountRow.count || 0),
      sourceCount: Number(sourceMetricsRow.count || 0),
      artifactCount: Number(artifactCountRow.count || 0),
      storageUsedBytes: Number(sourceMetricsRow.total_bytes || 0),
      storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
    };
  }
}
