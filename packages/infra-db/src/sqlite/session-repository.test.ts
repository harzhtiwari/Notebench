import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";

const TEST_DIR = path.resolve(`.tmp/test/test-session-repo-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
Windows holds file locks briefly after sqlite handles close, longer under
parallel suites: retry transient lock errors with a generous budget.
*/
async function removeDirWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code ?? "";
      if (["EPERM", "EBUSY", "ENOTEMPTY"].includes(code) && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}

describe("SqliteSessionRepository & Sessions Table Migration", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry();
    }
    mkdirSync(TEST_DIR, { recursive: true });
  }, 120_000);

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("round-trips sessions and resolves them by token digest", async () => {
    const dbPath = path.join(TEST_DIR, "test-sessions.sqlite");
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

  it("renews expiry via touch and deletes sessions on demand", async () => {
    const dbPath = path.join(TEST_DIR, "test-revoke.sqlite");
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

      await sessions.deleteSession(other.id);
      expect(await sessions.findByTokenHash("c".repeat(64))).not.toBeNull();
      expect(await sessions.findByTokenHash("d".repeat(64))).toBeNull();

      const cleared = await sessions.deleteAllSessions(owner.id);
      expect(cleared).toBe(1);
      expect(await sessions.listSessions(owner.id)).toHaveLength(0);
    } finally {
      close();
    }
  });

});
