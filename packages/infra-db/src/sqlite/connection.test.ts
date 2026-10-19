import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  createSqliteDatabase,
  DEFAULT_SQLITE_DB_PATH,
  findMonorepoRoot,
} from "./connection.js";

const TEST_DIR = path.resolve(`.tmp/test/test-db-connection-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

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

describe("SQLite Database Connection", () => {
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

  it("exposes default db path matching ADR 0004 (.notebook/db/app.sqlite)", () => {
    const root = findMonorepoRoot();
    expect(DEFAULT_SQLITE_DB_PATH).toBe(path.join(root, ".notebook", "db", "app.sqlite"));
  });

  it("resolves the monorepo root correctly even from a nested subpackage directory", () => {
    const root = findMonorepoRoot();
    expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(true);

    const nestedPath = path.join(root, "apps", "server");
    expect(findMonorepoRoot(nestedPath)).toBe(root);

    const deepNestedPath = path.join(root, "packages", "infra-db", "src", "sqlite");
    expect(findMonorepoRoot(deepNestedPath)).toBe(root);
  });

  it("opens database in WAL mode with busy_timeout=5000 and synchronous=NORMAL", () => {
    const dbPath = path.join(TEST_DIR, "test-wal.sqlite");
    const { sqlite, close } = createSqliteDatabase({ dbPath });

    try {
      // PRAGMA journal_mode
      const journalMode = sqlite.pragma("journal_mode", { simple: true });
      expect(journalMode).toBe("wal");

      // PRAGMA busy_timeout = 5000
      const busyTimeout = sqlite.pragma("busy_timeout", { simple: true });
      expect(busyTimeout).toBe(5000);

      // PRAGMA synchronous = 1 (NORMAL)
      const synchronous = sqlite.pragma("synchronous", { simple: true });
      expect(synchronous).toBe(1);

      // PRAGMA foreign_keys = 1 (ON)
      const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
      expect(foreignKeys).toBe(1);
    } finally {
      close();
    }
  });

  it("automatically creates parent directories if they do not exist", () => {
    const nestedPath = path.join(TEST_DIR, "nested", "sub", "test.sqlite");
    const { close } = createSqliteDatabase({ dbPath: nestedPath });
    try {
      expect(existsSync(nestedPath)).toBe(true);
    } finally {
      close();
    }
  });

  it("returns a usable Drizzle ORM database instance", () => {
    const dbPath = path.join(TEST_DIR, "test-drizzle.sqlite");
    const { db, close } = createSqliteDatabase({ dbPath });
    try {
      expect(db).toBeDefined();
      expect(typeof db.select).toBe("function");
    } finally {
      close();
    }
  });
});
