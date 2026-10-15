import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";

const TEST_DIR = resolve(".tmp/test-session-repo");

describe("SqliteSessionRepository & Sessions Table Migration", () => {
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

  it("round-trips sessions and resolves them by token digest", async () => {
    const dbPath = join(TEST_DIR, "test-sessions.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const sessions = new SqliteSessionRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });

      const created = await sessions.createSession({
        userId: owner.id,
        tokenHash: "a".repeat(64),
        userAgent: "vitest",
        ipAddress: "127.0.0.1",
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      });

      expect(created.id).toBeDefined();
      const found = await sessions.findByTokenHash("a".repeat(64));
      expect(found?.id).toBe(created.id);
      expect(await sessions.findByTokenHash("b".repeat(64))).toBeNull();
    } finally {
      close();
    }
  });

  it("renews expiry via touch and revokes others while keeping current", async () => {
    const dbPath = join(TEST_DIR, "test-revoke.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const sessions = new SqliteSessionRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });
      const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      const current = await sessions.createSession({
        userId: owner.id,
        tokenHash: "c".repeat(64),
        expiresAt: expiry,
      });
      const other = await sessions.createSession({
        userId: owner.id,
        tokenHash: "d".repeat(64),
        expiresAt: expiry,
      });

      const later = new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString();
      const touched = await sessions.touchSession(current.id, {
        lastActiveAt: new Date().toISOString(),
        expiresAt: later,
      });
      expect(touched?.expiresAt).toBe(later);

      const revoked = await sessions.deleteOtherSessions(owner.id, current.id);
      expect(revoked).toBe(1);
      expect(await sessions.findByTokenHash("c".repeat(64))).not.toBeNull();
      expect(await sessions.findByTokenHash("d".repeat(64))).toBeNull();
      expect(other.id).toBeDefined();

      const cleared = await sessions.deleteAllSessions(owner.id);
      expect(cleared).toBe(1);
      expect(await sessions.listSessions(owner.id)).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("updates the owner passcode hash", async () => {
    const dbPath = join(TEST_DIR, "test-passcode.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const owner = await accounts.createOwner({
        displayName: "Owner",
        passcodeHash: "old-hash",
      });
      const updated = await accounts.updatePasscodeHash(owner.id, "new-hash");
      expect(updated?.passcodeHash).toBe("new-hash");
      expect((await accounts.findOwner())?.passcodeHash).toBe("new-hash");
    } finally {
      close();
    }
  });
});
