import type Database from "better-sqlite3";
import { and, eq, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  SetupAlreadyCompletedError,
  type AccountRepositoryPort,
  type PasscodeChangeResult,
  type UserRecord,
  type CreateOwnerInput,
} from "@notebench/contracts";
import { sessions, users } from "../schema/sqlite.js";

/**
Migration DDL creating canonical users table if it does not already exist.
The partial unique index enforces the single-owner invariant at the schema
level (PRD A1): even a raw insert bypassing the repository cannot create a
second owner row.
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
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_single_owner
  ON users (role) WHERE role = 'owner';
`;

/**
Executes users table migration on a SQLite database.
*/
export function migrateUsersTable(sqlite: Database.Database): void {
  sqlite.exec(INIT_USERS_TABLE_SQL);
}

/**
Maps a users row to the canonical UserRecord.
*/
function toUserRecord(row: typeof users.$inferSelect): UserRecord {
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

/**
SQLite implementation of AccountRepositoryPort using Drizzle ORM.
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

  findOwner(): Promise<UserRecord | null> {
    const row = this.db.select().from(users).where(eq(users.role, "owner")).limit(1).get();
    return Promise.resolve(row ? toUserRecord(row) : null);
  }

  createOwner(input: CreateOwnerInput): Promise<UserRecord> {
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

    // Single guarded statement: SQLite evaluates the NOT EXISTS check and the
    // insert atomically, so concurrent setup calls that both pass the
    // findOwner() pre-check can never create two owners (Ticket 01 review D1).
    const result = this.db.run(sql`
      INSERT INTO users (id, email, display_name, passcode_hash, role, created_at, updated_at)
      SELECT ${newRecord.id}, ${newRecord.email}, ${newRecord.displayName}, ${newRecord.passcodeHash}, 'owner', ${newRecord.createdAt}, ${newRecord.updatedAt}
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
    `);

    if (result.changes === 0) {
      // Reject (not a sync throw) so `.rejects` callers observe the failure.
      return Promise.reject(
        new SetupAlreadyCompletedError(
          "Owner setup has already been completed. Setup route is permanently disabled."
        )
      );
    }

    return Promise.resolve({
      id: newRecord.id,
      email: newRecord.email,
      displayName: newRecord.displayName,
      passcodeHash: newRecord.passcodeHash,
      role: "owner",
      createdAt: newRecord.createdAt,
      updatedAt: newRecord.updatedAt,
    });
  }

  updatePasscodeAndRevokeOtherSessions(
    userId: string,
    passcodeHash: string,
    keepSessionId: string
  ): Promise<PasscodeChangeResult | null> {
    const now = new Date().toISOString();
    // One transaction (NOTEBENCH 6.6): a failure in either statement rolls
    // back both, so the passcode and the session set never drift apart.
    try {
      const result = this.db.transaction((tx) => {
        // Indexing (not `.get()`) keeps the honest `| undefined` type: the
        // driver yields no row when the UPDATE matches nothing.
        const updated = tx
          .update(users)
          .set({ passcodeHash, updatedAt: now })
          .where(eq(users.id, userId))
          .returning()
          .all()[0];
        if (!updated) {
          return null;
        }
        const revoked = tx
          .delete(sessions)
          .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
          .run();
        return { user: toUserRecord(updated), revokedSessions: revoked.changes };
      });
      return Promise.resolve(result);
    } catch (error) {
      // Mid-transaction failure: reject rather than throw synchronously,
      // preserving the Promise-returning contract for `.rejects` callers.
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
