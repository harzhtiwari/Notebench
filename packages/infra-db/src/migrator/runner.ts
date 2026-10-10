import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  NotebookError,
  InvarianceViolationError,
  ParserFailedError,
} from "@notebook/contracts";
import type { Logger } from "@notebook/logger";
import {
  createPreMigrationBackup,
  rollbackFromBackup,
  type BackupMetadata,
} from "./pre-migration-backup.js";

export interface SqliteMigrateOptions {
  activeDb: Database.Database;
  activeDbPath: string;
  backupDir?: string | undefined;
  migrationsFolder?: string | undefined;
  migrationFn?: ((db: Database.Database) => Promise<void> | void) | undefined;
  maxRetainedBackups?: number | undefined;
  logger?: Logger | undefined;
}

export interface SqliteMigrateResult {
  success: boolean;
  backupMeta?: BackupMetadata;
}

/**
 * Executes SQLite migrations safely with pre-migration verification and automated rollback.
 */
export async function runSqliteMigrations(
  options: SqliteMigrateOptions
): Promise<SqliteMigrateResult> {
  const {
    activeDb,
    activeDbPath,
    backupDir,
    migrationsFolder,
    migrationFn,
    maxRetainedBackups,
    logger,
  } = options;

  logger?.info({ activeDbPath }, "Starting pre-migration verification");

  // Step 1: Pre-migration integrity check
  try {
    const preCheck = activeDb.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (preCheck[0]?.integrity_check !== "ok") {
      throw new InvarianceViolationError(
        `Pre-migration integrity check failed: ${JSON.stringify(preCheck)}`
      );
    }
  } catch (err) {
    if (err instanceof NotebookError) throw err;
    throw new InvarianceViolationError(
      `Pre-migration verification error: ${String(err)}`
    );
  }

  // Step 2: Create pre-migration backup snapshot
  let backupMeta: BackupMetadata | undefined;
  try {
    backupMeta = await createPreMigrationBackup({
      activeDb,
      activeDbPath,
      backupDir,
      maxRetainedBackups,
      logger,
    });
  } catch (backupErr) {
    logger?.error(
      { err: backupErr },
      "Cannot proceed with migration: Pre-migration backup failed"
    );
    throw backupErr;
  }

  // Step 3: Run migration
  try {
    if (migrationFn) {
      await migrationFn(activeDb);
    } else if (migrationsFolder) {
      const db = drizzle(activeDb);
      migrate(db, { migrationsFolder });
    }

    logger?.info("SQLite migration applied successfully");
    return { success: true, backupMeta };
  } catch (migrationErr) {
    logger?.error(
      { err: migrationErr },
      "Migration failed; triggering automated rollback"
    );

    if (backupMeta) {
      try {
        rollbackFromBackup({
          activeDb,
          activeDbPath,
          backupPath: backupMeta.backupDbPath,
          logger,
        });
      } catch (rollbackErr) {
        logger?.fatal(
          { err: rollbackErr },
          "Critical failure during automated migration rollback"
        );
        throw rollbackErr;
      }
    }

    throw new ParserFailedError(
      `Migration failed and database was rolled back: ${String(migrationErr)}`
    );
  }
}
