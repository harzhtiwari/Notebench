import type { Pool } from "pg";

/**
 * Ticket 28 — hand-written PostgreSQL bootstrap DDL.
 *
 * Mirrors the SQLite design in `initializeSqliteSchema`
 * (sqlite/notebook-repository.ts): the schema is bootstrapped with idempotent
 * DDL rather than generated migration artifacts (the repo has no
 * drizzle-kit migrations folder). Column names and nullability follow
 * `schema/pg.ts`, which is kept in parity with `schema/sqlite.ts` by
 * `test/schema-parity.test.ts`.
 *
 * The pgvector extension and the vector table are owned by
 * `PgVectorStore.init()` (infra-vectorstore) and are intentionally not part
 * of the relational schema bootstrap.
 */
export const PG_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email varchar(255),
    display_name varchar(255),
    passcode_hash text,
    role varchar(50) NOT NULL DEFAULT 'owner',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notebooks (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    trashed_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sources (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    url text,
    file_path text,
    mime_type varchar(100),
    byte_size integer,
    content_hash varchar(128),
    token_count integer,
    summary text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    type varchar(50) NOT NULL,
    title varchar(255) NOT NULL,
    schema_version integer NOT NULL DEFAULT 1,
    current_version_id uuid,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS artifact_versions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    number integer NOT NULL,
    created_by varchar(50) NOT NULL,
    model varchar(100),
    instruction text,
    parent_version_id uuid REFERENCES artifact_versions(id),
    content text NOT NULL,
    content_digest varchar(64),
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL,
    user_agent text,
    ip_address varchar(45),
    last_active_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deletion_jobs (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE,
    level varchar(50) NOT NULL,
    status varchar(50) NOT NULL,
    progress integer NOT NULL DEFAULT 0,
    freed_bytes integer,
    deleted_counts text,
    error text,
    created_at timestamptz NOT NULL,
    completed_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS memory_rules (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE,
    rule_text text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS provider_keys (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    key_id text NOT NULL,
    ciphertext text NOT NULL,
    iv text NOT NULL,
    tag text NOT NULL,
    schema_version integer NOT NULL DEFAULT 1,
    masked_key text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS provider_model_selections (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    provider text NOT NULL,
    model_id text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  // Parity with the SQLite DDL in model-selection-repository.ts and the
  // declared index in schema/pg.ts + schema/sqlite.ts.
  `CREATE UNIQUE INDEX IF NOT EXISTS provider_model_selections_user_kind
    ON provider_model_selections (user_id, kind)`,
];

/**
 * Applies the PostgreSQL schema to a database. Idempotent; safe to run on an
 * empty database or repeatedly over an existing one.
 */
export async function initializePgSchema(pool: Pool): Promise<void> {
  for (const statement of PG_SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}
