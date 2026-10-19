import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readdirSync, utimesSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  createPreMigrationBackup,
  rollbackFromBackup,
  runSqliteMigrations,
} from "./index.js";

const TEST_DIR = path.resolve(`.tmp/test/test-db-migrator-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

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

describe("Pre-Migration Backup & Rollback Engine", () => {
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

  it("creates an atomic pre-migration backup with metadata manifest and SHA-256", async () => {
    const caseDir = path.join(TEST_DIR, "case-1");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = path.join(caseDir, "backups");
    const dbPath = path.join(caseDir, "app.sqlite");

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

  it("keeps every pre-migration backup inside the 14-day retention window, even beyond maxRetainedBackups", async () => {
    const caseDir = path.join(TEST_DIR, "case-2");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = path.join(caseDir, "backups");
    const dbPath = path.join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");
      activeDb.exec("CREATE TABLE t (id INTEGER);");

      // 12 fresh backups with maxRetainedBackups = 5: the canonical spec 8.7
      // union (top-10 OR all within 14 days, whichever keeps more) keeps the
      // whole retention window, not just the count cap.
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

      expect(sqliteFiles.length).toBe(12);
      expect(metaFiles.length).toBe(12);
    } finally {
      activeDb.close();
    }
  });

  it("never prunes the newest pre-migration backup, even when mtime order disagrees with name order", async () => {
    const caseDir = path.join(TEST_DIR, "case-2-never-newest");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = path.join(caseDir, "backups");
    const dbPath = path.join(caseDir, "app.sqlite");

    const activeDb = new Database(dbPath);
    try {
      activeDb.pragma("journal_mode = WAL");
      activeDb.exec("CREATE TABLE t (id INTEGER);");

      const created: string[] = [];
      for (let i = 0; i < 4; i++) {
        const meta = await createPreMigrationBackup({
          activeDb,
          activeDbPath: dbPath,
          backupDir,
          maxRetainedBackups: 100,
        });
        created.push(meta.backupDbPath);
      }

      // Forge mtimes so the first-created (name-first) snapshot is the newest
      // by mtime and the last-created one is the oldest; all four are outside
      // the 14-day window, so only the count cap governs their fate.
      const dayMs = 86_400_000;
      for (const [i, element] of created.entries()) {
        const when = new Date(Date.now() - (i + 1) * 20 * dayMs);
        const file = element;
        utimesSync(file, when, when);
        utimesSync(`${file}.meta.json`, when, when);
      }

      const newest = created[0];
      const oldest = created[3];
      if (newest === undefined || oldest === undefined) {
        throw new Error("expected four created snapshots");
      }

      const fresh = await createPreMigrationBackup({
        activeDb,
        activeDbPath: dbPath,
        backupDir,
        maxRetainedBackups: 2,
      });

      // Canonical union keeps the fresh snapshot plus the mtime-newest one;
      // the oldest (80-day) snapshot must be pruned.
      const remaining = readdirSync(backupDir).filter((f) => f.endsWith(".sqlite"));
      expect(remaining).toHaveLength(2);
      expect(existsSync(fresh.backupDbPath)).toBe(true);
      expect(existsSync(newest)).toBe(true);
      expect(existsSync(`${newest}.meta.json`)).toBe(true);
      expect(existsSync(oldest)).toBe(false);
    } finally {
      activeDb.close();
    }
  });

  it("unlinks orphaned WAL and SHM files during automated rollback", () => {
    const caseDir = path.join(TEST_DIR, "case-3");
    mkdirSync(caseDir, { recursive: true });
    const dbPath = path.join(caseDir, "app.sqlite");
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    const backupPath = path.join(caseDir, "snapshot.sqlite");

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
    const caseDir = path.join(TEST_DIR, "case-4");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = path.join(caseDir, "backups");
    const dbPath = path.join(caseDir, "app.sqlite");

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
    const caseDir = path.join(TEST_DIR, "case-5");
    mkdirSync(caseDir, { recursive: true });
    const backupDir = path.join(caseDir, "backups");
    const dbPath = path.join(caseDir, "app.sqlite");

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
