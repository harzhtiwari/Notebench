import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { providerKeys } from "../schema/pg.js";
import type {
  VaultKeyRecord,
  VaultKeyStorage,
} from "../sqlite/vault-key-repository.js";

/**
Ticket 28 — PostgreSQL implementation of the vault ciphertext storage port.

Mirrors `SqliteVaultKeyRepository` (sqlite/vault-key-repository.ts):
`save` is a replace by (provider, keyId, userId), `delete` reports whether a
row was removed, and `list` is scoped to one user. The port type is declared
in the SQLite module because `infra-db` cannot import `@notebench/infra-vault`
(guard check 11); both implementations shape-match `VaultStorage`.

The `provider_keys` table is created by `initializePgSchema` (bootstrap.ts),
not by the constructor — PostgreSQL DDL is applied once per database by the
migrator path in `migrator/runner.ts`.
*/
export class PgVaultKeyRepository implements VaultKeyStorage {
  constructor(
    private readonly db: NodePgDatabase<{ providerKeys: typeof providerKeys }>
  ) {}

  async save(record: VaultKeyRecord): Promise<void> {
    await this.db
      .delete(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, record.provider),
          eq(providerKeys.keyId, record.keyId),
          eq(providerKeys.userId, record.userId)
        )
      );
    await this.db.insert(providerKeys).values({
      id: record.id,
      userId: record.userId,
      provider: record.provider,
      keyId: record.keyId,
      ciphertext: record.envelope.ciphertext,
      iv: record.envelope.iv,
      tag: record.envelope.tag,
      schemaVersion: record.envelope.schemaVersion,
      maskedKey: record.maskedKey,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    });
  }

  async get(
    provider: string,
    keyId: string,
    userId: string
  ): Promise<VaultKeyRecord | null> {
    const rows = await this.db
      .select()
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, provider),
          eq(providerKeys.keyId, keyId),
          eq(providerKeys.userId, userId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async delete(provider: string, keyId: string, userId: string): Promise<boolean> {
    const removed = await this.db
      .delete(providerKeys)
      .where(
        and(
          eq(providerKeys.provider, provider),
          eq(providerKeys.keyId, keyId),
          eq(providerKeys.userId, userId)
        )
      )
      .returning({ id: providerKeys.id });
    return removed.length > 0;
  }

  async list(userId: string): Promise<VaultKeyRecord[]> {
    const rows = await this.db
      .select()
      .from(providerKeys)
      .where(eq(providerKeys.userId, userId));
    return rows.map((row) => toRecord(row));
  }
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
