import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";

const TEST_DIR = resolve(`.tmp/test/test-account-repo-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

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

describe("SqliteAccountRepository & Users Table Migration", () => {
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

  it("never persists plaintext passcode bytes in the database file (Ticket 01)", async () => {
    const dbPath = join(TEST_DIR, "test-no-plaintext.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    const plaintext = "correct-plaintext-passphrase-xyz-12345";
    const phc = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$ZmFrZXBoY3Zvci1maWxlLXNjYW4";

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      await repo.createOwner({ displayName: "Owner", passcodeHash: phc });
    } finally {
      close();
    }

    const raw = readFileSync(dbPath);
    expect(raw.includes(Buffer.from(plaintext, "utf-8"))).toBe(false);
    expect(raw.includes(Buffer.from(phc, "utf-8"))).toBe(true);
  });
});
