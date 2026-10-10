import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  ParserFailedError,
  NotFoundError,
  InvarianceViolationError,
} from "@notebook/contracts";
import type { Logger } from "@notebook/logger";

export interface BackupMetadata {
  backupId: string;
  timestamp: string;
  sourceDbPath: string;
  backupDbPath: string;
  fileSizeBytes: number;
  sha256: string;
  pendingMigrationsCount: number;
  sourceUserVersion: number;
}

export interface BackupOptions {
  activeDb: Database.Database;
  activeDbPath: string;
  backupDir?: string | undefined;
  pendingMigrationsCount?: number | undefined;
  maxRetainedBackups?: number | undefined;
  logger?: Logger | undefined;
}

export interface RollbackOptions {
  activeDb: Database.Database;
  activeDbPath: string;
  backupPath: string;
  logger?: Logger | undefined;
}

/**
 * Executes a safe online point-in-time backup using SQLite Online Backup API.
 * Grounded in Research Report 20 & Settled Decision 8.1.
 */
export async function createPreMigrationBackup(
  options: BackupOptions
): Promise<BackupMetadata> {
  const {
    activeDb,
    activeDbPath,
    backupDir = resolve(".notebook/db/backups"),
    pendingMigrationsCount = 0,
    maxRetainedBackups = 10,
    logger,
  } = options;

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = randomUUID();
  const backupFileName = `pre-migration-${timestamp}-${backupId.slice(0, 8)}.sqlite`;
  const backupDbPath = join(backupDir, backupFileName);
  const metaFilePath = `${backupDbPath}.meta.json`;

  logger?.info({ backupDbPath }, "Starting pre-migration SQLite online backup");

  const startTime = Date.now();

  try {
    // 1. Execute online backup using better-sqlite3 API on libuv thread pool
    await activeDb.backup(backupDbPath, {
      progress({ totalPages, remainingPages }) {
        if (totalPages > 0) {
          const pct = Math.round(
            ((totalPages - remainingPages) / totalPages) * 100
          );
          logger?.debug(
            { pct, totalPages, remainingPages },
            "SQLite backup progress"
          );
        }
        return 100;
      },
    });

    const elapsedMs = Date.now() - startTime;
    const fileBuffer = readFileSync(backupDbPath);
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

    // Fetch user_version PRAGMA from active DB
    const userVersionRow = activeDb.pragma("user_version", { simple: true });
    const sourceUserVersion =
      typeof userVersionRow === "number" ? userVersionRow : 0;

    const metadata: BackupMetadata = {
      backupId,
      timestamp: new Date().toISOString(),
      sourceDbPath: activeDbPath,
      backupDbPath,
      fileSizeBytes: fileBuffer.byteLength,
      sha256,
      pendingMigrationsCount,
      sourceUserVersion,
    };

    writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2), "utf-8");

    logger?.info(
      { elapsedMs, backupId, sizeBytes: fileBuffer.byteLength, sha256 },
      "Pre-migration SQLite backup completed successfully"
    );

    // 2. Prune obsolete backups beyond retention threshold
    pruneOldBackups(backupDir, maxRetainedBackups, logger);

    return metadata;
  } catch (error) {
    logger?.error(
      { err: error, backupDbPath },
      "Failed to create pre-migration SQLite backup"
    );
    if (existsSync(backupDbPath)) {
      try {
        unlinkSync(backupDbPath);
      } catch {
        // ignore cleanup error
      }
    }
    throw new ParserFailedError(
      `Pre-migration database backup failed: ${String(error)}`
    );
  }
}

/**
 * Prunes historical backups beyond retention ceiling, keeping the newest records.
 */
export function pruneOldBackups(
  backupDir: string,
  maxRetained: number,
  logger?: Logger
): void {
  try {
    const entries = readdirSync(backupDir, { withFileTypes: true });
    const sqliteFiles = entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".sqlite") &&
          e.name.startsWith("pre-migration-")
      )
      .map((e) => ({
        name: e.name,
        path: join(backupDir, e.name),
        metaPath: join(backupDir, `${e.name}.meta.json`),
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Newest first

    if (sqliteFiles.length > maxRetained) {
      const toDelete = sqliteFiles.slice(maxRetained);
      for (const item of toDelete) {
        logger?.info(
          { file: item.name },
          "Pruning historical pre-migration backup"
        );
        if (existsSync(item.path)) unlinkSync(item.path);
        if (existsSync(item.metaPath)) unlinkSync(item.metaPath);
      }
    }
  } catch (err) {
    logger?.warn({ err }, "Failed to prune older backups; non-fatal");
  }
}

/**
 * Restores database from snapshot after migration failure, mitigating orphaned WAL risks.
 * Supports both object options and positional arguments.
 * Grounded in Research Report 20 & Settled Decision 8.3.
 */
export function rollbackFromBackup(
  arg1: Database.Database | RollbackOptions,
  activeDbPathArg?: string,
  backupPathArg?: string,
  loggerArg?: Logger
): void {
  let activeDb: Database.Database;
  let activeDbPath: string;
  let backupPath: string;
  let logger: Logger | undefined;

  if (typeof arg1 === "object" && "backupPath" in arg1) {
    activeDb = arg1.activeDb;
    activeDbPath = arg1.activeDbPath;
    backupPath = arg1.backupPath;
    logger = arg1.logger;
  } else {
    activeDb = arg1;
    activeDbPath = activeDbPathArg ?? "";
    backupPath = backupPathArg ?? "";
    logger = loggerArg;
  }

  logger?.error(
    { activeDbPath, backupPath },
    "Initiating automated rollback to pre-migration snapshot"
  );

  // Step 1: Terminate active connection handles to release OS locks
  try {
    activeDb.close();
    logger?.info(
      "Closed source database connection prior to rollback file replacement"
    );
  } catch (err) {
    logger?.warn(
      { err },
      "Database close threw during rollback; proceeding with filesystem reset"
    );
  }

  // Step 2: Critical: Eliminate orphaned WAL and SHM files to avoid replay corruption
  const walPath = `${activeDbPath}-wal`;
  const shmPath = `${activeDbPath}-shm`;

  if (existsSync(walPath)) {
    logger?.info(
      { walPath },
      "Unlinking orphaned WAL file to prevent invalid replay"
    );
    unlinkSync(walPath);
  }
  if (existsSync(shmPath)) {
    logger?.info({ shmPath }, "Unlinking orphaned SHM coordinate file");
    unlinkSync(shmPath);
  }

  // Step 3: Overwrite base database file with backup snapshot
  if (!existsSync(backupPath)) {
    throw new NotFoundError(
      `Fatal rollback error: Pre-migration backup file not found at ${backupPath}`
    );
  }

  copyFileSync(backupPath, activeDbPath);
  logger?.info(
    { activeDbPath, backupPath },
    "Restored active database file from snapshot"
  );

  // Step 4: Re-open connection and verify database integrity
  const restoredDb = new Database(activeDbPath);
  try {
    const check = restoredDb.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (check[0]?.integrity_check !== "ok") {
      throw new InvarianceViolationError(
        `Restoration failed integrity check: ${JSON.stringify(check)}`
      );
    }
  } finally {
    restoredDb.close();
  }
}
