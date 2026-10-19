import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  CreateSessionRecordInput,
  SessionRecord,
  SessionRepositoryPort,
} from "@notebench/contracts";
import { sessions } from "../schema/sqlite.js";

/**
Migration DDL creating the canonical sessions table if it does not already exist.
*/
export const INIT_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  last_active_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

/**
Executes the sessions table migration on a SQLite database.
*/
export function migrateSessionsTable(sqlite: Database.Database): void {
  sqlite.exec(INIT_SESSIONS_TABLE_SQL);
}

function toRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
SQLite implementation of SessionRepositoryPort using Drizzle ORM.
Stores only SHA-256 digests; raw tokens never reach this layer.
*/
export class SqliteSessionRepository implements SessionRepositoryPort {
  constructor(
    private readonly db: BetterSQLite3Database<{ sessions: typeof sessions }>,
    private readonly sqlite?: Database.Database | undefined
  ) {
    if (this.sqlite) {
      migrateSessionsTable(this.sqlite);
    }
  }

  createSession(input: CreateSessionRecordInput): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      lastActiveAt: now,
      expiresAt: input.expiresAt,
      createdAt: now,
    };
    this.db.insert(sessions).values(row).run();
    return Promise.resolve(toRecord(row));
  }

  findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
      .get();
    return Promise.resolve(row ? toRecord(row) : null);
  }

  touchSession(
    id: string,
    input: { lastActiveAt: string; expiresAt: string }
  ): Promise<SessionRecord | null> {
    // Indexing (not `.get()`) keeps the honest `| undefined` type: the driver
    // yields no row when the UPDATE matches nothing.
    const updated = this.db
      .update(sessions)
      .set({ lastActiveAt: input.lastActiveAt, expiresAt: input.expiresAt })
      .where(eq(sessions.id, id))
      .returning()
      .all()[0];
    return Promise.resolve(updated ? toRecord(updated) : null);
  }

  deleteSession(id: string): Promise<void> {
    this.db.delete(sessions).where(eq(sessions.id, id)).run();
    return Promise.resolve();
  }

  deleteAllSessions(userId: string): Promise<number> {
    const result = this.db.delete(sessions).where(eq(sessions.userId, userId)).run();
    return Promise.resolve(result.changes);
  }

  listSessions(userId: string): Promise<SessionRecord[]> {
    const rows = this.db.select().from(sessions).where(eq(sessions.userId, userId)).all();
    return Promise.resolve(rows.map((row) => toRecord(row)));
  }
}
