import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { providerModelSelections } from "../schema/sqlite.js";

/**
Migration DDL creating the provider_model_selections table (Ticket 04, D6/D7).
Mirrors the Drizzle schema in ../schema/sqlite.ts (providerModelSelections).
*/
export const INIT_MODEL_SELECTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS provider_model_selections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_model_selections_user_kind
  ON provider_model_selections (user_id, kind);
`;

/**
Executes the provider_model_selections table migration on a SQLite database.
*/
export function migrateModelSelectionsTable(sqlite: Database.Database): void {
  sqlite.exec(INIT_MODEL_SELECTIONS_TABLE_SQL);
}

/**
Chat vs embedding selection kinds (PRD D6: stored separately).
*/
export type ModelSelectionKind = "chat" | "embedding";

export interface ModelSelection {
  userId: string;
  kind: ModelSelectionKind;
  provider: string;
  modelId: string;
}

export interface StoredModelSelection extends ModelSelection {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function toSelection(row: typeof providerModelSelections.$inferSelect): StoredModelSelection {
  const kind = row.kind === "embedding" ? "embedding" : "chat";
  return {
    id: row.id,
    userId: row.userId,
    kind,
    provider: row.provider,
    modelId: row.modelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
SQLite persistence for selected chat/embedding models (Ticket 04, D6/D7).
One row per (user_id, kind): saving a kind replaces only that kind.
Custom typed model IDs persist verbatim — no allowlist here.
*/
export class SqliteModelSelectionRepository {
  constructor(
    private readonly db: BetterSQLite3Database<{ providerModelSelections: typeof providerModelSelections }>,
    private readonly sqlite?: Database.Database | undefined
  ) {
    if (this.sqlite) {
      migrateModelSelectionsTable(this.sqlite);
    }
  }

  async save(selection: ModelSelection): Promise<StoredModelSelection> {
    const now = new Date().toISOString();
    const existing = await this.get(selection.userId, selection.kind);
    if (existing) {
      this.db
        .update(providerModelSelections)
        .set({ provider: selection.provider, modelId: selection.modelId, updatedAt: now })
        .where(
          and(
            eq(providerModelSelections.userId, selection.userId),
            eq(providerModelSelections.kind, selection.kind)
          )
        )
        .run();
      const updated = await this.get(selection.userId, selection.kind);
      if (!updated) {
        throw new Error("Model selection vanished after update");
      }
      return updated;
    }
    const record: StoredModelSelection = {
      id: randomUUID(),
      userId: selection.userId,
      kind: selection.kind,
      provider: selection.provider,
      modelId: selection.modelId,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .insert(providerModelSelections)
      .values({
        id: record.id,
        userId: record.userId,
        kind: record.kind,
        provider: record.provider,
        modelId: record.modelId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .run();
    return record;
  }

  get(userId: string, kind: ModelSelectionKind): Promise<StoredModelSelection | null> {
    const row = this.db
      .select()
      .from(providerModelSelections)
      .where(
        and(eq(providerModelSelections.userId, userId), eq(providerModelSelections.kind, kind))
      )
      .limit(1)
      .get();
    return Promise.resolve(row ? toSelection(row) : null);
  }

  list(userId: string): Promise<StoredModelSelection[]> {
    const rows = this.db
      .select()
      .from(providerModelSelections)
      .where(eq(providerModelSelections.userId, userId))
      .all();
    return Promise.resolve(rows.map((row) => toSelection(row)));
  }
}
