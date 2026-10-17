import type { VaultKeyRecord, VaultStorage } from "@notebench/infra-vault";
import type { SqliteVaultKeyRepository } from "@notebench/infra-db";

/**
 * Composition-root glue (Guard 11): wires the SQLite vault-key repository
 * as an `EncryptedVault` storage backend. Lives in `apps/server` because
 * infra packages may not import each other.
 */
export class SqliteVaultStorage implements VaultStorage {
  constructor(private readonly repo: SqliteVaultKeyRepository) {}

  async save(record: VaultKeyRecord): Promise<void> {
    if (record.userId === undefined) {
      throw new Error("SqliteVaultStorage.save requires a userId.");
    }
    await this.repo.save({
      id: record.id,
      userId: record.userId,
      provider: record.provider,
      keyId: record.keyId,
      envelope: {
        schemaVersion: record.envelope.schemaVersion,
        provider: record.envelope.provider,
        keyId: record.envelope.keyId,
        ciphertext: record.envelope.ciphertext,
        iv: record.envelope.iv,
        tag: record.envelope.tag,
      },
      maskedKey: record.maskedKey,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async get(
    provider: string,
    keyId: string,
    userId?: string | undefined
  ): Promise<VaultKeyRecord | null> {
    if (userId === undefined) {
      return null;
    }
    const found = await this.repo.get(provider, keyId, userId);
    if (!found) {
      return null;
    }
    return {
      id: found.id,
      userId: found.userId,
      provider: found.provider,
      keyId: found.keyId,
      envelope: { ...found.envelope },
      maskedKey: found.maskedKey,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    };
  }

  async delete(provider: string, keyId: string, userId?: string | undefined): Promise<boolean> {
    if (userId === undefined) {
      return false;
    }
    return this.repo.delete(provider, keyId, userId);
  }

  async list(userId?: string | undefined): Promise<readonly VaultKeyRecord[]> {
    if (userId === undefined) {
      return [];
    }
    const rows = await this.repo.list(userId);
    return rows.map((found) => ({
      id: found.id,
      userId: found.userId,
      provider: found.provider,
      keyId: found.keyId,
      envelope: { ...found.envelope },
      maskedKey: found.maskedKey,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    }));
  }
}
