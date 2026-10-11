import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";

const TEST_DIR = resolve(".tmp/test-account-repo");

describe("SqliteAccountRepository & Users Table Migration", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("automatically applies users table migration and finds null when empty", async () => {
    const dbPath = join(TEST_DIR, "test-empty.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      const owner = await repo.findOwner();
      expect(owner).toBeNull();
    } finally {
      close();
    }
  });

  it("creates owner with passcode hash and retrieves record faithfully", async () => {
    const dbPath = join(TEST_DIR, "test-owner.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      const created = await repo.createOwner({
        displayName: "Sovereign Operator",
        email: "operator@notebench.local",
        passcodeHash: "$argon2id$v=19$m=65536,t=3,p=1$fake$hash",
      });

      expect(created.id).toBeDefined();
      expect(created.displayName).toBe("Sovereign Operator");
      expect(created.email).toBe("operator@notebench.local");
      expect(created.passcodeHash).toBe("$argon2id$v=19$m=65536,t=3,p=1$fake$hash");
      expect(created.role).toBe("owner");

      const found = await repo.findOwner();
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.displayName).toBe("Sovereign Operator");
      expect(found?.passcodeHash).toBe(created.passcodeHash);
    } finally {
      close();
    }
  });
});
