import type Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { providerKeys } from "../schema/sqlite.js";

/**
 * Migration DDL creating the canonical provider_keys (vault ciphertext) table.
 * Mirrors the Drizzle schema in ../schema/sqlite.ts (providerKeys).
 */
export const INIT_VAULT_KEYS_TABLE_SQL = `
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
`;

/**
 * Executes the provider_keys table migration on a SQLite database.
 */
export function migrateVaultKeysTable(sqlite: Database.Database): void {
  sqlite.exec(INIT_VAULT_KEYS_TABLE_SQL);
}

/**
 * Ciphertext envelope as stored. Shape-matches the infra-vault VaultEnvelope
 * structurally so the composition root can wire this repository as an
 * EncryptedVault VaultStorage without an infra-to-infra import (guard 11).
 */
export interface VaultKeyEnvelope {
  schemaVersion: number;
  provider: string;
  keyId: string;
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface VaultKeyRecord {
  id: string;
  userId: string;
  provider: string;
  keyId: string;
  envelope: VaultKeyEnvelope;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultKeyStorage {
  save(record: VaultKeyRecord): Promise<void>;
  get(provider: string, keyId: string, userId: string): Promise<VaultKeyRecord | null>;
  delete(provider: string, keyId: string, userId: string): Promise<boolean>;
  list(userId: string): Promise<VaultKeyRecord[]>;
}

function toRecord(row: typeof providerKeys.$inferSelect): VaultKeyRecord {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    keyId: row.keyId,
    envelope: {
      schemaVersion: row.schemaVersion,
      provider: row.provider,
      keyId: row.keyId,
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
    },
    maskedKey: row.maskedKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * SQLite implementation of vault ciphertext storage over provider_keys.
 * Stores only envelopes + fixed-length masks; plaintext never reaches this layer.
 */
export class SqliteVaultKeyRepository implements VaultKeyStorage {
  constructor(
    private readonly db: BetterSQLite3Database<{ providerKeys: typeof providerKeys }>,
    private readonly sqlite?: Database.Database | undefined
  ) {
    if (this.sqlite) {
      migrateVaultKeysTable(this.sqlite);
    }
  }

  async save(record: VaultKeyRecord): Promise<void> {
    this.db
      .delete(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, record.provider),
          eq(providerKeys.keyId, record.keyId),
          eq(providerKeys.userId, record.userId)
        )
      )
      .run();
    this.db
      .insert(providerKeys)
      .values({
        id: record.id,
        userId: record.userId,
        provider: record.provider,
        keyId: record.keyId,
        ciphertext: record.envelope.ciphertext,
        iv: record.envelope.iv,
        tag: record.envelope.tag,
        schemaVersion: record.envelope.schemaVersion,
        maskedKey: record.maskedKey,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .run();
  }

  async get(
    provider: string,
    keyId: string,
    userId: string
  ): Promise<VaultKeyRecord | null> {
    const row = this.db
      .select()
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, provider),
          eq(providerKeys.keyId, keyId),
          eq(providerKeys.userId, userId)
        )
      )
      .limit(1)
      .get();
    if (!row) {
      return null;
    }
    return toRecord(row);
  }

  async delete(provider: string, keyId: string, userId: string): Promise<boolean> {
    const result = this.db
      .delete(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, provider),
          eq(providerKeys.keyId, keyId),
          eq(providerKeys.userId, userId)
        )
      )
      .run();
    return Number(result.changes) > 0;
  }

  async list(userId: string): Promise<VaultKeyRecord[]> {
    const rows = this.db
      .select()
      .from(providerKeys)
      .where(eq(providerKeys.userId, userId))
      .all();
    return rows.map(toRecord);
  }
}
