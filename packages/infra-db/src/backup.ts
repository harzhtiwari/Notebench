import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { InvarianceViolationError, NotFoundError } from "@notebench/contracts";
import type { Logger } from "@notebench/logger";

// Canonical layout: matches createSqliteDatabase (.notebook/db/app.sqlite)
// and the pre-migration default backup dir (.notebook/db/backups).
const NOTEBOOK_DIR_NAME = ".notebook";
const SQLITE_DB_DIR_NAME = "db";
const SQLITE_BACKUP_DIR_NAME = "backups";

// Retention policy (spec 8.2): last 10 backups or all within 14 days,
// whichever keeps more; the newest snapshot is never pruned.
export const MAX_RETAINED_BACKUPS = 10;
export const RETENTION_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

export function defaultBackupDir(repoRoot: string = process.cwd()): string {
  return path.join(
    path.resolve(repoRoot),
    NOTEBOOK_DIR_NAME,
    SQLITE_DB_DIR_NAME,
    SQLITE_BACKUP_DIR_NAME
  );
}

export interface BackupSnapshotEntry {
  name: string;
  path: string;
  metaPath?: string | undefined;
  mtimeMs: number;
}

function compareNewestFirst(
  a: BackupSnapshotEntry,
  b: BackupSnapshotEntry
): number {
  return b.mtimeMs === a.mtimeMs ? b.name.localeCompare(a.name) : b.mtimeMs - a.mtimeMs;
}

/**
List `.sqlite` snapshots in a backup dir, newest first.
*/
export function listBackupSnapshots(backupDir: string): BackupSnapshotEntry[] {
  if (!existsSync(backupDir)) return [];
  const entries: BackupSnapshotEntry[] = [];
  const dirEntries = readdirSync(backupDir, { withFileTypes: true });
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".sqlite")) continue;
    const snapshotPath = path.join(backupDir, entry.name);
    const metaPath = `${snapshotPath}.meta.json`;
    entries.push({
      name: entry.name,
      path: snapshotPath,
      metaPath: existsSync(metaPath) ? metaPath : undefined,
      mtimeMs: statSync(snapshotPath).mtimeMs,
    });
  }
  entries.sort(compareNewestFirst);
  return entries;
}

export interface RetentionOptions {
  maxRetained?: number | undefined;
  retentionDays?: number | undefined;
  nowMs?: number | undefined;
}

/**
Pure retention selector: keep the newest `maxRetained` plus every snapshot
inside the day window (union keeps more); the newest entry is always kept.
*/
export function selectBackupsToPrune(
  entries: BackupSnapshotEntry[],
  options: RetentionOptions = {}
): BackupSnapshotEntry[] {
  const {
    maxRetained = MAX_RETAINED_BACKUPS,
    retentionDays = RETENTION_WINDOW_DAYS,
    nowMs = Date.now(),
  } = options;
  const sorted = entries.toSorted(compareNewestFirst);
  if (sorted.length === 0) return [];
  const cutoffMs = nowMs - retentionDays * MS_PER_DAY;
  const keep = new Set<number>();
  const countCap = Math.max(0, maxRetained);
  for (let i = 0; i < sorted.length && i < countCap; i++) {
    keep.add(i);
  }
  for (const [i, entry] of sorted.entries()) {
    if (entry.mtimeMs >= cutoffMs) {
      keep.add(i);
    }
  }
  keep.add(0);
  return sorted.filter((_, index) => !keep.has(index));
}

export interface PruneResult {
  kept: string[];
  pruned: string[];
}

export interface PruneBackupsOptions extends RetentionOptions {
  logger?: Logger | undefined;
}

/**
Apply the retention policy; `.sqlite` and `.meta.json` are deleted together.
*/
export function pruneBackups(
  backupDir: string,
  options: PruneBackupsOptions = {}
): PruneResult {
  const { logger, ...retention } = options;
  const entries = listBackupSnapshots(backupDir);
  const doomed = new Set(
    selectBackupsToPrune(entries, retention).map((e) => e.name)
  );
  const kept: string[] = [];
  const pruned: string[] = [];
  for (const entry of entries) {
    if (!doomed.has(entry.name)) {
      kept.push(entry.name);
      continue;
    }
    logger?.info({ file: entry.name }, "Pruning expired backup snapshot");
    if (existsSync(entry.path)) unlinkSync(entry.path);
    if (entry.metaPath !== undefined && existsSync(entry.metaPath)) {
      unlinkSync(entry.metaPath);
    }
    pruned.push(entry.name);
  }
  return { kept, pruned };
}

export interface OnlineBackupResult {
  destPath: string;
  totalPages: number;
}

/**
Hot backup of a live database via the SQLite Online Backup API
(better-sqlite3 db.backup(); raw file copy is banned by spec 8.1).
The promise is awaited BEFORE any close: closing aborts pending backups.
*/
export async function backupLiveDatabase(
  activeDb: Database.Database,
  destPath: string,
  logger?: Logger  
): Promise<OnlineBackupResult> {
  const dest = path.resolve(destPath);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) unlinkSync(dest);
  logger?.info({ dest }, "Starting SQLite online backup");
  const progress = await activeDb.backup(dest);
  if (progress.remainingPages !== 0) {
    throw new InvarianceViolationError(
      `Online backup incomplete: ${String(progress.remainingPages)} pages remaining`
    );
  }
  return { destPath: dest, totalPages: progress.totalPages };
}

export interface IntegrityReport {
  backupDbPath: string;
  integrity: "ok";
}

/**
Verify a backup by opening a FRESH READ-WRITE handle and running
PRAGMA integrity_check (read-only WAL opens are unreliable: sqlite.org WAL §5).
*/
export function verifyBackupIntegrity(backupDbPath: string): IntegrityReport {
  if (!existsSync(backupDbPath)) {
    throw new NotFoundError(`Backup file not found at ${backupDbPath}`);
  }
  const probe = new Database(backupDbPath);
  try {
    const rows = probe.pragma("integrity_check") as {
      integrity_check: string;
    }[];
    const first = rows[0];
    if (first?.integrity_check !== "ok") {
      throw new InvarianceViolationError(
        `Backup failed integrity check: ${JSON.stringify(rows)}`
      );
    }
    return { backupDbPath, integrity: "ok" };
  } finally {
    probe.close();
  }
}

export interface WalShmRemoval {
  walRemoved: boolean;
  shmRemoved: boolean;
}

/**
Unlink `<db>-wal` / `<db>-shm` residue files. Production rollback (spec 8.3)
ALWAYS closes the database first: unlinking while open fails with EBUSY on
Windows and the files auto-vanish on the last clean close anyway.
*/
export function removeWalShmFiles(
  activeDbPath: string,
  logger?: Logger  
): WalShmRemoval {
  let isWalRemoved = false;
  let isShmRemoved = false;
  const walPath = `${activeDbPath}-wal`;
  if (existsSync(walPath)) {
    logger?.info({ walPath }, "Unlinking orphaned WAL file");
    unlinkSync(walPath);
    isWalRemoved = true;
  }
  const shmPath = `${activeDbPath}-shm`;
  if (existsSync(shmPath)) {
    logger?.info({ shmPath }, "Unlinking orphaned SHM file");
    unlinkSync(shmPath);
    isShmRemoved = true;
  }
  return { walRemoved: isWalRemoved, shmRemoved: isShmRemoved };
}
