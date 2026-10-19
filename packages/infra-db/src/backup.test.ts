import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  utimesSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  MAX_RETAINED_BACKUPS,
  RETENTION_WINDOW_DAYS,
  backupLiveDatabase,
  listBackupSnapshots,
  pruneBackups,
  removeWalShmFiles,
  selectBackupsToPrune,
  verifyBackupIntegrity,
  type BackupSnapshotEntry,
} from "./backup.js";
import { runBackupCli } from "./backup-cli.js";
import { rollbackFromBackup } from "./migrator/pre-migration-backup.js";

const TEST_ROOT = path.resolve(`.tmp/build/t26-backup-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
Windows holds file locks briefly after sqlite handles close, longer under
parallel suites: retry transient lock errors with a generous budget.
*/
async function removeDirWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
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

function freshCase(name: string): string {
  const dir = path.join(TEST_ROOT, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function openWalDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

function rowCount(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM note")
    .get() as { c: number };
  return row.c;
}

describe("ticket-26 live-WAL online backup", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("backup taken on a live WAL database opens cleanly with snapshot row count", async () => {
    const dir = freshCase("live-wal");
    const dbPath = path.join(dir, "app.sqlite");
    const activeDb = openWalDb(dbPath);
    try {
      activeDb.exec("CREATE TABLE note (id TEXT PRIMARY KEY, title TEXT);");
      activeDb.exec("INSERT INTO note VALUES ('1', 'a'), ('2', 'b'), ('3', 'c');");

      // WAL frames are present and un-checkpointed: this is a live backup.
      expect(existsSync(`${dbPath}-wal`)).toBe(true);

      const dest = path.join(dir, "snapshot.sqlite");
      const result = await backupLiveDatabase(activeDb, dest);

      // Writes after the awaited backup must not leak into the snapshot.
      activeDb.exec("INSERT INTO note VALUES ('4', 'd'), ('5', 'e');");
      expect(rowCount(activeDb)).toBe(5);

      expect(result.totalPages).toBeGreaterThan(0);
      expect(existsSync(dest)).toBe(true);

      const check = verifyBackupIntegrity(dest);
      expect(check.integrity).toBe("ok");

      // Opened via a fresh handle: snapshot row count, not the live count.
      const probe = new Database(dest);
      try {
        expect(rowCount(probe)).toBe(3);
      } finally {
        probe.close();
      }
    } finally {
      activeDb.close();
    }
  });

  it("verifyBackupIntegrity throws for a missing file instead of creating one", () => {
    const dir = freshCase("verify-missing");
    const missing = path.join(dir, "nope.sqlite");
    expect(() => verifyBackupIntegrity(missing)).toThrow(/not found/i);
    expect(existsSync(missing)).toBe(false);
  });
});

describe("ticket-26 retention policy (last 10 or 14 days, never newest)", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("keeps 10 of 12 all-expired fixtures and never deletes the newest", () => {
    const dir = freshCase("retention-12");
    const now = Date.now();
    const dayMs = 86_400_000;
    for (let i = 0; i < 12; i++) {
      const name = `pre-migration-202001${String(i + 1).padStart(2, "0")}-000000-aaaaaaaa.sqlite`;
      const file = path.join(dir, name);
      writeFileSync(file, `backup-${i}`);
      writeFileSync(`${file}.meta.json`, JSON.stringify({ i }));
      // All 30+i days old: outside the 14-day window. Higher i = newer.
      const mtime = new Date(now - (30 + 12 - i) * dayMs);
      utimesSync(file, mtime, mtime);
      utimesSync(`${file}.meta.json`, mtime, mtime);
    }

    const before = listBackupSnapshots(dir);
    expect(before).toHaveLength(12);
    const newestBefore = before[0];

    const { kept, pruned } = pruneBackups(dir, {
      maxRetained: 10,
      retentionDays: 14,
      nowMs: now,
    });

    expect(kept).toHaveLength(10);
    expect(pruned).toHaveLength(2);
    expect(kept).toContain(newestBefore?.name);
    expect(listBackupSnapshots(dir)).toHaveLength(10);
    // Manifests are pruned atomically with their database file.
    for (const name of pruned) {
      expect(existsSync(path.join(dir, name))).toBe(false);
      expect(existsSync(path.join(dir, `${name}.meta.json`))).toBe(false);
    }
  });

  it("within-window snapshots keep more than maxRetained", () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const entries: BackupSnapshotEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries.push({
        name: `s-${String(i).padStart(2, "0")}.sqlite`,
        path: `/fake/s-${i}.sqlite`,
        metaPath: undefined,
        mtimeMs: now - i * dayMs,
      });
    }
    const pruned = selectBackupsToPrune(entries, {
      maxRetained: 10,
      retentionDays: 14,
      nowMs: now,
    });
    expect(pruned).toHaveLength(0);
    expect(MAX_RETAINED_BACKUPS).toBe(10);
    expect(RETENTION_WINDOW_DAYS).toBe(14);
  });

  it("never prunes the single newest snapshot even when it is expired and beyond count", () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const entries: BackupSnapshotEntry[] = [];
    // Newest entry is 30 days old; 11 older ones are even older.
    for (let i = 0; i < 12; i++) {
      entries.push({
        name: `old-${String(i).padStart(2, "0")}.sqlite`,
        path: `/fake/old-${i}.sqlite`,
        metaPath: undefined,
        mtimeMs: now - (30 + 12 - i) * dayMs,
      });
    }
    const pruned = selectBackupsToPrune(entries, {
      maxRetained: 10,
      retentionDays: 14,
      nowMs: now,
    });
    expect(pruned).toHaveLength(2);
    const prunedNames = pruned.map((e) => e.name);
    expect(prunedNames).not.toContain("old-11.sqlite");
  });
});

describe("ticket-26 rollback proof (spec 8.3 close-first order)", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("WAL/SHM residue exists before rollback, is removed by the code, rows are restored", async () => {
    const dir = freshCase("rollback-83");
    const dbPath = path.join(dir, "app.sqlite");
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    const activeDb = openWalDb(dbPath);
    activeDb.exec("CREATE TABLE doc (id TEXT PRIMARY KEY, body TEXT);");
    activeDb.exec("INSERT INTO doc VALUES ('1', 'pre-migration');");

    const snapshotPath = path.join(dir, "snapshot.sqlite");
    await backupLiveDatabase(activeDb, snapshotPath);

    // Simulate migration damage with un-checkpointed WAL frames.
    activeDb.exec("INSERT INTO doc VALUES ('2', 'post-migration-damage');");
    expect(existsSync(walPath)).toBe(true);
    activeDb.close();

    const residueWal = path.join(dir, "residue-wal-bytes");
    const liveDb2 = openWalDb(dbPath);
    liveDb2.exec("INSERT INTO doc VALUES ('3', 'more-damage');");
    copyFileSync(walPath, residueWal);
    const residueShm = existsSync(shmPath) ? path.join(dir, "residue-shm-bytes") : undefined;
    if (residueShm !== undefined) copyFileSync(shmPath, residueShm);
    liveDb2.close();

    // Plant the residue: files exist on disk with no open connection,
    // exactly like leftovers from a crashed migration session.
    copyFileSync(residueWal, walPath);
    if (residueShm !== undefined) copyFileSync(residueShm, shmPath);
    expect(existsSync(walPath)).toBe(true);
    expect(existsSync(shmPath)).toBe(true);

    // Production 8.3 order: fresh handle, close first, then the code unlinks.
    const handle = new Database(dbPath);
    rollbackFromBackup({ activeDb: handle, activeDbPath: dbPath, backupPath: snapshotPath });

    expect(existsSync(walPath)).toBe(false);
    expect(existsSync(shmPath)).toBe(false);

    const restored = new Database(dbPath);
    try {
      const rows = restored.prepare("SELECT id FROM doc ORDER BY id").all() as { id: string }[];
      expect(rows.map((r) => r.id)).toEqual(["1"]);
      const check = restored.pragma("integrity_check") as { integrity_check: string }[];
      expect(check[0]?.integrity_check).toBe("ok");
    } finally {
      restored.close();
    }
  });

  it("unit test of the rollback helper: removes WAL/SHM residue while a DB is open (graph #40)", () => {
    const dir = freshCase("helper-open-db");
    // Scope note: the open `liveDb` below is a DIFFERENT path than the residue
    // target, so this proves residue unlink with a database open in-process —
    // NOT target-open unlink (impossible on Windows; see removeWalShmFiles).
    // A live connection stays open in this process for the whole test.
    const livePath = path.join(dir, "live.sqlite");
    const liveDb = openWalDb(livePath);
    liveDb.exec("CREATE TABLE k (v TEXT);");
    liveDb.exec("INSERT INTO k VALUES ('x');");
    try {
      // Simulated crashed-session residue for an unrelated database file.
      const targetBase = path.join(dir, "crashed.sqlite");
      writeFileSync(targetBase, "placeholder");
      const walPath = `${targetBase}-wal`;
      const shmPath = `${targetBase}-shm`;
      writeFileSync(walPath, "simulated-wal-frames");
      writeFileSync(shmPath, "simulated-shm-index");

      const result = removeWalShmFiles(targetBase);

      expect(result).toEqual({ walRemoved: true, shmRemoved: true });
      expect(existsSync(walPath)).toBe(false);
      expect(existsSync(shmPath)).toBe(false);
      expect(existsSync(targetBase)).toBe(true);

      const absent = removeWalShmFiles(path.join(dir, "nothing.sqlite"));
      expect(absent).toEqual({ walRemoved: false, shmRemoved: false });
    } finally {
      liveDb.close();
    }
  });
});

describe("ticket-26 backup-cli (used by scripts/backup.sh and scripts/restore.sh)", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("backup + verify + prune + unlink-wal-shm round-trip", async () => {
    const dir = freshCase("cli");
    const dbPath = path.join(dir, "app.sqlite");
    const setup = openWalDb(dbPath);
    setup.exec("CREATE TABLE c (v TEXT);");
    setup.exec("INSERT INTO c VALUES ('ok');");
    setup.close();

    const dest = path.join(dir, "backups", "snap.sqlite");
    expect(await runBackupCli(["backup", dbPath, dest])).toBe(0);
    expect(existsSync(dest)).toBe(true);
    expect(await runBackupCli(["verify", dest])).toBe(0);
    expect(await runBackupCli(["verify", path.join(dir, "missing.sqlite")])).toBe(1);

    writeFileSync(`${dbPath}-wal`, "residue");
    expect(await runBackupCli(["unlink-wal-shm", dbPath])).toBe(0);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);

    expect(await runBackupCli(["prune", path.join(dir, "backups")])).toBe(0);
    expect(await runBackupCli(["nope"])).toBe(2);
    expect(await runBackupCli([])).toBe(2);
  });
});

describe("ticket-26 stat helper", () => {
  it("listBackupSnapshots sorts newest-first", () => {
    const dir = freshCase("ordering");
    const now = Date.now();
    for (const [name, ageDays] of [["a.sqlite", 5], ["b.sqlite", 1], ["c.sqlite", 9]] as const) {
      const file = path.join(dir, `pre-migration-${name}`);
      writeFileSync(file, "x");
      const mtime = new Date(now - ageDays * 86_400_000);
      utimesSync(file, mtime, mtime);
    }
    const listed = listBackupSnapshots(dir).map((e) => e.name);
    expect(listed).toEqual([
      "pre-migration-b.sqlite",
      "pre-migration-a.sqlite",
      "pre-migration-c.sqlite",
    ]);
  });
});
