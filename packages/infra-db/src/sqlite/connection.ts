import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { dirname, resolve, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { sqliteSchema } from "../schema/index.js";

/**
 * Resolves the monorepo root by locating pnpm-workspace.yaml upwards from a given directory.
 * Falls back to process.cwd() if not found.
 */
export function findMonorepoRoot(startDir = process.cwd()): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}

/**
 * Default persistent SQLite database path conforming to ADR 0004.
 * Always anchors to the monorepo root .notebook/ directory regardless of subpackage cwd.
 */
export const DEFAULT_SQLITE_DB_PATH = join(findMonorepoRoot(), ".notebook", "db", "app.sqlite");

export interface SqliteDatabaseConfig {
  /**
   * File path to the SQLite database.
   * Defaults to .notebook/db/app.sqlite.
   */
  dbPath?: string | undefined;
  /**
   * Timeout in ms when database is locked.
   * Defaults to 5000ms.
   */
  busyTimeout?: number | undefined;
  /**
   * Disk synchronization mode.
   * Defaults to NORMAL for safe, high-performance WAL operation.
   */
  synchronous?: ("OFF" | "NORMAL" | "FULL" | "EXTRA") | undefined;
  /**
   * Whether to enforce foreign keys.
   * Defaults to true.
   */
  foreignKeys?: boolean | undefined;
  /**
   * Open the database in read-only mode.
   * Defaults to false.
   */
  readOnly?: boolean | undefined;
  /**
   * If true, throws if database file does not exist.
   * Defaults to false.
   */
  fileMustExist?: boolean | undefined;
  /**
   * Optional custom SQLite Database instance (e.g. for testing or memory databases).
   */
  existingDb?: Database.Database | undefined;
}

export interface SqliteDatabaseInstance {
  db: BetterSQLite3Database<typeof sqliteSchema>;
  sqlite: Database.Database;
  dbPath: string;
  close: () => void;
}

/**
 * Factory function creating and configuring an embedded SQLite database in WAL mode.
 */
export function createSqliteDatabase(
  config: SqliteDatabaseConfig = {}
): SqliteDatabaseInstance {
  const dbPath =
    config.dbPath === ":memory:"
      ? ":memory:"
      : config.dbPath
        ? resolve(config.dbPath)
        : DEFAULT_SQLITE_DB_PATH;

  let sqlite: Database.Database;

  if (config.existingDb) {
    sqlite = config.existingDb;
  } else {
    // Ensure parent directory exists for file-backed databases
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    sqlite = new Database(dbPath, {
      readonly: config.readOnly ?? false,
      fileMustExist: config.fileMustExist ?? false,
    });
  }

  // 1. Mandatory WAL mode
  const journalMode = sqlite.pragma("journal_mode = WAL", { simple: true });
  if (journalMode !== "wal" && dbPath !== ":memory:") {
    // In-memory databases return 'memory' for journal_mode
    throw new Error(`Failed to enable WAL mode on database at ${dbPath}; got ${String(journalMode)}`);
  }

  // 2. Mandatory busy_timeout = 5000ms to eliminate concurrency lock errors
  const busyTimeout = config.busyTimeout ?? 5000;
  sqlite.pragma(`busy_timeout = ${busyTimeout}`);

  // 3. Mandatory synchronous = NORMAL for optimal WAL persistence balance
  const synchronous = config.synchronous ?? "NORMAL";
  sqlite.pragma(`synchronous = ${synchronous}`);

  // 4. Foreign key integrity enforcement
  const foreignKeys = config.foreignKeys ?? true;
  sqlite.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);

  // 5. Wrap with Drizzle ORM
  const db = drizzle(sqlite, { schema: sqliteSchema });

  return {
    db,
    sqlite,
    dbPath,
    close: () => {
      sqlite.close();
    },
  };
}
