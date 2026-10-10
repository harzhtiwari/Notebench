import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import {
  createPreMigrationBackup,
  rollbackFromBackup,
  runSqliteMigrations,
} from "./index.js";

const TEST_DIR = resolve(".tmp/test-db-migrator");

describe("Pre-Migration Backup & Rollback Engine", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      try {
        rmSync(TEST_DIR, { recursive: true, force: true });
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  });

  it("creates an atomic pre-migration backup with metadata manifest and SHA-256", async () => {
    const caseDir = join(TEST_DIR, "case-1");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = join(caseDir, "backups");
    const dbPath = join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");
      activeDb.exec("CREATE TABLE test_item (id TEXT PRIMARY KEY, name TEXT);");
      activeDb.exec("INSERT INTO test_item VALUES ('1', 'Alpha');");

      const meta = await createPreMigrationBackup({
        activeDb,
        activeDbPath: dbPath,
        backupDir,
        pendingMigrationsCount: 1,
      });

      expect(meta.backupId).toBeDefined();
      expect(existsSync(meta.backupDbPath)).toBe(true);
      expect(existsSync(`${meta.backupDbPath}.meta.json`)).toBe(true);

      // Verify backup DB content independently
      const backupDb = new Database(meta.backupDbPath);
      try {
        const row = backupDb
          .prepare("SELECT * FROM test_item WHERE id = '1'")
          .get() as { name: string };
        expect(row.name).toBe("Alpha");
      } finally {
        backupDb.close();
      }
    } finally {
      activeDb.close();
    }
  });

  it("prunes old pre-migration backups beyond maxRetainedBackups", async () => {
    const caseDir = join(TEST_DIR, "case-2");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = join(caseDir, "backups");
    const dbPath = join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");
      activeDb.exec("CREATE TABLE t (id INTEGER);");

      // Create 12 backups with maxRetainedBackups = 5
      for (let i = 0; i < 12; i++) {
        await createPreMigrationBackup({
          activeDb,
          activeDbPath: dbPath,
          backupDir,
          maxRetainedBackups: 5,
        });
      }

      const files = readdirSync(backupDir);
      const sqliteFiles = files.filter((f) => f.endsWith(".sqlite"));
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

      expect(sqliteFiles.length).toBe(5);
      expect(metaFiles.length).toBe(5);
    } finally {
      activeDb.close();
    }
  });

  it("unlinks orphaned WAL and SHM files during automated rollback", () => {
    const caseDir = join(TEST_DIR, "case-3");
    mkdirSync(caseDir, { recursive: true });
    const dbPath = join(caseDir, "app.sqlite");
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    const backupPath = join(caseDir, "snapshot.sqlite");

    // 1. Create a snapshot database with known state
    const snapshotDb = new Database(backupPath);
    snapshotDb.exec("CREATE TABLE snapshot_state (val TEXT);");
    snapshotDb.exec("INSERT INTO snapshot_state VALUES ('original');");
    snapshotDb.close();

    // 2. Create active database in WAL mode and write to it so WAL is actively generated
    const activeDb = new Database(dbPath);
    activeDb.pragma("journal_mode = WAL");
    activeDb.exec("CREATE TABLE active_state (val TEXT);");
    activeDb.exec("INSERT INTO active_state VALUES ('in-flight');");

    // 3. Rollback
    rollbackFromBackup({
      activeDb,
      activeDbPath: dbPath,
      backupPath,
    });

    // 4. Assert orphaned WAL and SHM are erased
    expect(existsSync(walPath)).toBe(false);
    expect(existsSync(shmPath)).toBe(false);

    // 5. Assert active DB restored from snapshot
    const restoredDb = new Database(dbPath);
    try {
      const row = restoredDb
        .prepare("SELECT * FROM snapshot_state")
        .get() as { val: string };
      expect(row.val).toBe("original");
    } finally {
      restoredDb.close();
    }
  });

  it("runSqliteMigrations executes migration and succeeds", async () => {
    const caseDir = join(TEST_DIR, "case-4");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = join(caseDir, "backups");
    const dbPath = join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");

      const result = await runSqliteMigrations({
        activeDb,
        activeDbPath: dbPath,
        backupDir,
        migrationFn: async (db) => {
          db.exec("CREATE TABLE migrated_table (id TEXT PRIMARY KEY);");
        },
      });

      expect(result.success).toBe(true);
      const check = activeDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='migrated_table'"
        )
        .get();
      expect(check).toBeDefined();
    } finally {
      activeDb.close();
    }
  });

  it("runSqliteMigrations rolls back if migration throws", async () => {
    const caseDir = join(TEST_DIR, "case-5");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = join(caseDir, "backups");
    const dbPath = join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");
      activeDb.exec("CREATE TABLE original_table (val TEXT);");
      activeDb.exec("INSERT INTO original_table VALUES ('intact');");

      await expect(
        runSqliteMigrations({
          activeDb,
          activeDbPath: dbPath,
          backupDir,
          migrationFn: async (db) => {
            db.exec("CREATE TABLE will_fail (val TEXT);");
            throw new Error("Simulated migration crash mid-transaction");
          },
        })
      ).rejects.toThrow("Migration failed and database was rolled back");

      // Verify database restored cleanly
      const verifyDb = new Database(dbPath);
      try {
        const row = verifyDb
          .prepare("SELECT * FROM original_table")
          .get() as { val: string };
        expect(row.val).toBe("intact");
      } finally {
        verifyDb.close();
      }
    } finally {
      try {
        activeDb.close();
      } catch {
        // already closed during rollback
      }
    }
  });
});
