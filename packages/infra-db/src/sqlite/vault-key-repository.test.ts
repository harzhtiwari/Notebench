import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";
import {
  SqliteVaultKeyRepository,
  migrateVaultKeysTable,
} from "./vault-key-repository.js";

const TEST_DIR = resolve(`.tmp/test/test-vault-repo-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
 * Windows holds file locks briefly after sqlite handles close, longer under
 * parallel suites: retry transient lock errors with a generous budget.
 */
async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}

const ENVELOPE = {
  schemaVersion: 1,
  provider: "openai",
  keyId: "models.openaiKey",
  ciphertext: "Y2lwaGVydGV4dA",
  iv: "aXYxMjM0NTY3ODkw",
  tag: "dGFnMTIzNDU2Nzg5MDEy",
};

describe("SqliteVaultKeyRepository & provider_keys migration (Ticket 03 RED)", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry(TEST_DIR);
    }
    mkdirSync(TEST_DIR, { recursive: true });
  }, 120_000);

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry(TEST_DIR);
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("migrates provider_keys table and starts empty", async () => {
    const dbPath = join(TEST_DIR, "vault-empty.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });
      migrateVaultKeysTable(sqlite);
      const repo = new SqliteVaultKeyRepository(db, sqlite);
      expect(await repo.list(owner.id)).toEqual([]);
      expect(await repo.get("openai", "models.openaiKey", owner.id)).toBeNull();
    } finally {
      close();
    }
  });

  it("saves and retrieves a ciphertext envelope with masked key only", async () => {
    const dbPath = join(TEST_DIR, "vault-roundtrip.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });
      migrateVaultKeysTable(sqlite);
      const repo = new SqliteVaultKeyRepository(db, sqlite);
      await repo.save({
        id: "rec-1",
        userId: owner.id,
        provider: "openai",
        keyId: "models.openaiKey",
        envelope: ENVELOPE,
        maskedKey: "sk-...cdef",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const found = await repo.get("openai", "models.openaiKey", owner.id);
      expect(found).not.toBeNull();
      expect(found?.envelope).toEqual(ENVELOPE);
      expect(found?.maskedKey).toBe("sk-...cdef");
    } finally {
      close();
    }
  });

  it("deleting a key removes its ciphertext row", async () => {
    const dbPath = join(TEST_DIR, "vault-delete.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });
      migrateVaultKeysTable(sqlite);
      const repo = new SqliteVaultKeyRepository(db, sqlite);
      await repo.save({
        id: "rec-1",
        userId: owner.id,
        provider: "openai",
        keyId: "models.openaiKey",
        envelope: ENVELOPE,
        maskedKey: "sk-...cdef",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(await repo.delete("openai", "models.openaiKey", owner.id)).toBe(true);
      expect(await repo.get("openai", "models.openaiKey", owner.id)).toBeNull();
      expect(await repo.list(owner.id)).toEqual([]);
    } finally {
      close();
    }
  });
});
