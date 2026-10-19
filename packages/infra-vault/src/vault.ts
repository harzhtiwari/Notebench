import crypto from "node:crypto";
import { VAULT_CONSTANTS } from "./constants.js";
import { encryptSecret, decryptSecret, type VaultEnvelope, type AadPayload } from "./crypto.js";
import { deriveMaskedKey } from "./mask.js";
import type { VaultSecret } from "./secret.js";

export interface VaultKeyRecord {
  readonly id: string;
  readonly userId?: string | undefined;
  readonly provider: string;
  readonly keyId: string;
  readonly envelope: VaultEnvelope;
  readonly maskedKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VaultStorage {
  save(record: VaultKeyRecord): Promise<void> | void;
  get(provider: string, keyId: string, userId?: string): Promise<VaultKeyRecord | null> | VaultKeyRecord | null;
  delete(provider: string, keyId: string, userId?: string): Promise<boolean> | boolean;
  list(userId?: string): Promise<readonly VaultKeyRecord[]> | readonly VaultKeyRecord[];
}

/**
In-memory storage adapter for tests and ephemeral runs.
*/
export class MemoryVaultStorage implements VaultStorage {
  private readonly records = new Map<string, VaultKeyRecord>();

  private makeKey(provider: string, keyId: string, userId = "global"): string {
    return `${userId}:${provider}:${keyId}`;
  }

  public save(record: VaultKeyRecord): void {
    const key = this.makeKey(record.provider, record.keyId, record.userId);
    this.records.set(key, record);
  }

  public get(provider: string, keyId: string, userId?: string): VaultKeyRecord | null {
    const key = this.makeKey(provider, keyId, userId);
    return this.records.get(key) ?? null;
  }

  public delete(provider: string, keyId: string, userId?: string): boolean {
    const key = this.makeKey(provider, keyId, userId);
    return this.records.delete(key);
  }

  public list(userId?: string): readonly VaultKeyRecord[] {
    const results: VaultKeyRecord[] = [];
    for (const record of this.records.values()) {
      if (!userId || record.userId === userId) {
        results.push(record);
      }
    }
    return results;
  }
}

export interface KeyStatusResult {
  readonly configured: boolean;
  readonly maskedKey?: string | undefined;
}

/**
High-level Encrypted Vault service coordinating encryption, storage, masking, and RUP guarantees.
*/
export class EncryptedVault {
  constructor(
    private readonly masterKey: Buffer,
    private readonly storage: VaultStorage = new MemoryVaultStorage()
  ) {}

  public async setKey(
    provider: string,
    keyId: string,
    plaintext: string,
    userId?: string
  ): Promise<{ maskedKey: string }> {
    const aad: AadPayload = {
      schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
      provider,
      keyId,
    };

    const envelope = encryptSecret(plaintext, this.masterKey, aad);
    const maskedKey = deriveMaskedKey(plaintext);
    const now = new Date().toISOString();

    const record: VaultKeyRecord = {
      id: crypto.randomUUID(),
      userId,
      provider,
      keyId,
      envelope,
      maskedKey,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.save(record);
    return { maskedKey };
  }

  public async getKey(
    provider: string,
    keyId: string,
    userId?: string
  ): Promise<VaultSecret | null> {
    const record = await this.storage.get(provider, keyId, userId);
    return record ? decryptSecret(record.envelope, this.masterKey) : null;
  }

  public async getStatus(
    provider: string,
    keyId: string,
    userId?: string
  ): Promise<KeyStatusResult> {
    const record = await this.storage.get(provider, keyId, userId);
    if (!record) {
      return { configured: false };
    }
    return {
      configured: true,
      maskedKey: record.maskedKey,
    };
  }

  public async deleteKey(
    provider: string,
    keyId: string,
    userId?: string
  ): Promise<boolean> {
    const isDeleted = await this.storage.delete(provider, keyId, userId);
    return isDeleted;
  }

  public async listConfiguredKeys(
    userId?: string
  ): Promise<readonly { provider: string; keyId: string; maskedKey: string }[]> {
    const records = await this.storage.list(userId);
    return records.map((r) => ({
      provider: r.provider,
      keyId: r.keyId,
      maskedKey: r.maskedKey,
    }));
  }
}
