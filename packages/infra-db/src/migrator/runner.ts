import type Database from "better-sqlite3";
import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import {
  NotebookError,
  InvarianceViolationError,
  ParserFailedError,
} from "@notebench/contracts";
import type { Logger } from "@notebench/logger";
import { pgSchema } from "../schema/index.js";
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
Executes SQLite migrations safely with pre-migration verification and automated rollback.
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
    const preCheck = activeDb.pragma("integrity_check") as {
      integrity_check: string;
    }[];
    if (preCheck[0]?.integrity_check !== "ok") {
      throw new InvarianceViolationError(
        `Pre-migration integrity check failed: ${JSON.stringify(preCheck)}`
      );
    }
  } catch (error) {
    if (error instanceof NotebookError) throw error;
    throw new InvarianceViolationError(
      `Pre-migration verification error: ${String(error)}`
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
  } catch (error) {
    logger?.error(
      { err: error },
      "Cannot proceed with migration: Pre-migration backup failed"
    );
    throw error;
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
  } catch (error) {
    logger?.error(
      { err: error },
      "Migration failed; triggering automated rollback"
    );

    try {
      rollbackFromBackup({
        activeDb,
        activeDbPath,
        backupPath: backupMeta.backupDbPath,
        logger,
      });
    } catch (error_) {
      logger?.fatal(
        { err: error_ },
        "Critical failure during automated migration rollback"
      );
      throw error_;
    }

    throw new ParserFailedError(
      `Migration failed and database was rolled back: ${String(error)}`
    );
  }
}

export interface PgMigrateOptions {
  /**
  Live pg.Pool (e.g. from `createPgDatabase` in src/pg/connection.ts).
  */
  pool: Pool;
  /**
  Hand-bootstrapped DDL, mirroring the SQLite `migrationFn` design
  (e.g. `initializePgSchema` from src/pg/bootstrap.ts). Receives the raw
  pool, exactly like the SQLite callback receives the raw database handle.
  */
  migrationFn?: ((pool: Pool) => Promise<void> | void) | undefined;
  /**
  Optional drizzle-kit migrations folder, applied through
  `drizzle-orm/node-postgres/migrator` (reuse rule). No folder exists in
  the repo yet; the bootstrap DDL is the current migration path.
  */
  migrationsFolder?: string | undefined;
  logger?: Logger | undefined;
}

export interface PgMigrateResult {
  success: boolean;
}

/**
Applies PostgreSQL migrations outside the SQLite backup/rollback cycle.

The SQLite runner snapshots the database file before migrating and restores
it on failure. A PostgreSQL server has no local file to snapshot, so this
path verifies connectivity (the Postgres equivalent of the SQLite
integrity check) and reports failures as `ParserFailedError` without
automatic rollback.
*/
export async function runPgMigrations(
  options: PgMigrateOptions
): Promise<PgMigrateResult> {
  const { pool, migrationFn, migrationsFolder, logger } = options;

  // Step 1: Pre-migration connectivity check
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    if (error instanceof NotebookError) throw error;
    throw new InvarianceViolationError(
      `Postgres pre-migration verification error: ${String(error)}`
    );
  }

  // Step 2: Run migration
  try {
    if (migrationFn) {
      await migrationFn(pool);
    } else if (migrationsFolder) {
      const db = drizzlePg(pool, { schema: pgSchema });
      await migratePg(db, { migrationsFolder });
    }

    logger?.info("PostgreSQL migration applied successfully");
    return { success: true };
  } catch (error) {
    logger?.error({ err: error }, "PostgreSQL migration failed");
    throw new ParserFailedError(
      `PostgreSQL migration failed (no automatic rollback on an external server): ${String(error)}`
    );
  }
}
