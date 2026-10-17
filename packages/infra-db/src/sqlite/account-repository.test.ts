import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { SetupAlreadyCompletedError } from "@notebook/contracts";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";

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

  it("atomically rejects a second owner with SetupAlreadyCompletedError (Ticket 01 review D1)", async () => {
    const dbPath = join(TEST_DIR, "test-single-owner.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);

      const first = await repo.createOwner({ displayName: "First Owner" });
      expect(first.role).toBe("owner");

      await expect(repo.createOwner({ displayName: "Second Owner" })).rejects.toThrow(
        SetupAlreadyCompletedError
      );

      const ownerRows = sqlite
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'")
        .get() as { count: number };
      expect(ownerRows.count).toBe(1);
    } finally {
      close();
    }
  });

  it("two createOwner calls in flight together settle with exactly one owner (TOCTOU regression)", async () => {
    const dbPath = join(TEST_DIR, "test-concurrent-owner.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);

      const results = await Promise.allSettled([
        repo.createOwner({ displayName: "Concurrent A" }),
        repo.createOwner({ displayName: "Concurrent B" }),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(SetupAlreadyCompletedError);

      const ownerRows = sqlite
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'")
        .get() as { count: number };
      expect(ownerRows.count).toBe(1);
    } finally {
      close();
    }
  });

  it("enforces the single-owner invariant at the schema level (partial unique index)", async () => {
    const dbPath = join(TEST_DIR, "test-owner-index.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      await repo.createOwner({ displayName: "Schema Owner" });

      // A raw insert bypassing the repository must still be rejected.
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO users (id, email, display_name, passcode_hash, role, created_at, updated_at)
             VALUES ('raw-second-owner', NULL, 'Raw Second Owner', NULL, 'owner',
                     '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
          .run()
      ).toThrow();
    } finally {
      close();
    }
  });

  it("atomically updates the passcode and revokes other sessions, keeping the current one (Ticket 02)", async () => {
    const dbPath = join(TEST_DIR, "test-atomic-change.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      const sessions = new SqliteSessionRepository(db, sqlite);
      const owner = await repo.createOwner({ displayName: "Owner", passcodeHash: "old-hash" });
      const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const current = await sessions.createSession({
        userId: owner.id,
        tokenHash: "c".repeat(64),
        expiresAt: expiry,
      });
      await sessions.createSession({
        userId: owner.id,
        tokenHash: "d".repeat(64),
        expiresAt: expiry,
      });

      const outcome = await repo.updatePasscodeAndRevokeOtherSessions(
        owner.id,
        "new-hash",
        current.id
      );

      expect(outcome?.user.passcodeHash).toBe("new-hash");
      expect(outcome?.revokedSessions).toBe(1);
      expect((await repo.findOwner())?.passcodeHash).toBe("new-hash");
      expect(await sessions.findByTokenHash("c".repeat(64))).not.toBeNull();
      expect(await sessions.findByTokenHash("d".repeat(64))).toBeNull();
    } finally {
      close();
    }
  });

  it("rolls back the passcode update when revoking sessions fails (same transaction)", async () => {
    const dbPath = join(TEST_DIR, "test-atomic-rollback.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      const sessions = new SqliteSessionRepository(db, sqlite);
      const owner = await repo.createOwner({ displayName: "Owner", passcodeHash: "old-hash" });
      const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const current = await sessions.createSession({
        userId: owner.id,
        tokenHash: "c".repeat(64),
        expiresAt: expiry,
      });
      await sessions.createSession({
        userId: owner.id,
        tokenHash: "d".repeat(64),
        expiresAt: expiry,
      });

      sqlite.exec(
        "CREATE TRIGGER poison_sessions_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'poisoned-revoke'); END"
      );

      await expect(
        repo.updatePasscodeAndRevokeOtherSessions(owner.id, "new-hash", current.id)
      ).rejects.toThrow(/poisoned-revoke/);

      // The failed transaction must leave NOTHING behind: old hash, both sessions.
      expect((await repo.findOwner())?.passcodeHash).toBe("old-hash");
      expect(await sessions.listSessions(owner.id)).toHaveLength(2);

      sqlite.exec("DROP TRIGGER poison_sessions_delete");
      const retry = await repo.updatePasscodeAndRevokeOtherSessions(
        owner.id,
        "new-hash",
        current.id
      );
      expect(retry?.revokedSessions).toBe(1);
      expect((await repo.findOwner())?.passcodeHash).toBe("new-hash");
    } finally {
      close();
    }
  });

  it("returns null for a missing user without touching sessions", async () => {
    const dbPath = join(TEST_DIR, "test-atomic-missing-user.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const repo = new SqliteAccountRepository(db, sqlite);
      const sessions = new SqliteSessionRepository(db, sqlite);
      const owner = await repo.createOwner({ displayName: "Owner", passcodeHash: "old-hash" });
      await sessions.createSession({
        userId: owner.id,
        tokenHash: "c".repeat(64),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      });

      const outcome = await repo.updatePasscodeAndRevokeOtherSessions(
        "00000000-0000-4000-8000-000000000000",
        "new-hash",
        "00000000-0000-4000-8000-000000000001"
      );

      expect(outcome).toBeNull();
      expect((await repo.findOwner())?.passcodeHash).toBe("old-hash");
      expect(await sessions.listSessions(owner.id)).toHaveLength(1);
    } finally {
      close();
    }
  });
});
