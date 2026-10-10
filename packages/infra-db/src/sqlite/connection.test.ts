import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  createSqliteDatabase,
  DEFAULT_SQLITE_DB_PATH,
} from "./connection.js";

const TEST_DIR = resolve(".tmp/test-db-connection");

describe("SQLite Database Connection", () => {
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

  it("exposes default db path matching ADR 0004 (.notebook/db/app.sqlite)", () => {
    expect(DEFAULT_SQLITE_DB_PATH).toBe(resolve(".notebook/db/app.sqlite"));
  });

  it("opens database in WAL mode with busy_timeout=5000 and synchronous=NORMAL", () => {
    const dbPath = join(TEST_DIR, "test-wal.sqlite");
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
    const nestedPath = join(TEST_DIR, "nested", "sub", "test.sqlite");
    const { close } = createSqliteDatabase({ dbPath: nestedPath });
    try {
      expect(existsSync(nestedPath)).toBe(true);
    } finally {
      close();
    }
  });

  it("returns a usable Drizzle ORM database instance", () => {
    const dbPath = join(TEST_DIR, "test-drizzle.sqlite");
    const { db, close } = createSqliteDatabase({ dbPath });
    try {
      expect(db).toBeDefined();
      expect(typeof db.select).toBe("function");
    } finally {
      close();
    }
  });
});
