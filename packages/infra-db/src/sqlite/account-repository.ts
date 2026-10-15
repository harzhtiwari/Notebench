import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AccountRepositoryPort,
  UserRecord,
  CreateOwnerInput,
} from "@notebook/contracts";
import { users } from "../schema/sqlite.js";

/**
 * Migration DDL creating canonical users table if it does not already exist.
 */
export const INIT_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  passcode_hash TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Executes users table migration on a SQLite database.
 */
export function migrateUsersTable(sqlite: Database.Database): void {
  sqlite.exec(INIT_USERS_TABLE_SQL);
}

/**
 * SQLite implementation of AccountRepositoryPort using Drizzle ORM.
 */
export class SqliteAccountRepository implements AccountRepositoryPort {
  constructor(
    private readonly db: BetterSQLite3Database<{ users: typeof users }>,
    private readonly sqlite?: Database.Database | undefined
  ) {
    if (this.sqlite) {
      migrateUsersTable(this.sqlite);
    }
  }

  async findOwner(): Promise<UserRecord | null> {
    const row = this.db.select().from(users).where(eq(users.role, "owner")).limit(1).get();
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      passcodeHash: row.passcodeHash,
      role: row.role === "member" ? "member" : "owner",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createOwner(input: CreateOwnerInput): Promise<UserRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newRecord = {
      id,
      email: input.email ?? null,
      displayName: input.displayName ?? null,
      passcodeHash: input.passcodeHash ?? null,
      role: "owner" as const,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(users).values(newRecord).run();

    return {
      id: newRecord.id,
      email: newRecord.email,
      displayName: newRecord.displayName,
      passcodeHash: newRecord.passcodeHash,
      role: "owner",
      createdAt: newRecord.createdAt,
      updatedAt: newRecord.updatedAt,
    };
  }

  async updatePasscodeHash(userId: string, passcodeHash: string): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const updated = this.db
      .update(users)
      .set({ passcodeHash, updatedAt: now })
      .where(eq(users.id, userId))
      .returning()
      .get();
    if (!updated) {
      return null;
    }
    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      passcodeHash: updated.passcodeHash,
      role: updated.role === "member" ? "member" : "owner",
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
