import {
  sqliteTable,
  text,
  integer,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
Users account entity table.
*/
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  passcodeHash: text("passcode_hash"),
  role: text("role").notNull().default("owner"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
Notebooks workspace container table.
All records strictly require user_id.
*/
export const notebooks = sqliteTable("notebooks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  trashedAt: text("trashed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
Sources reference document table.
All records strictly require user_id.
*/
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: text("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type").notNull(),
  url: text("url"),
  filePath: text("file_path"),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  contentHash: text("content_hash"),
  tokenCount: integer("token_count"),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
Artifacts living deliverable AST index table.
All records strictly require user_id.
*/
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: text("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  currentVersionId: text("current_version_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
Artifact versions append-only history DAG table.
All records strictly require user_id.
*/
export const artifactVersions = sqliteTable(
  "artifact_versions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    createdBy: text("created_by").notNull(),
    model: text("model"),
    instruction: text("instruction"),
    parentVersionId: text("parent_version_id"),
    content: text("content").notNull(),
    contentDigest: text("content_digest"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentVersionId],
      foreignColumns: [table.id],
    }),
  ]
);

/**
Sessions dual-token authentication table.
All records strictly require user_id.
*/
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastActiveAt: text("last_active_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

/**
Deletion jobs 6-level cascading deletion table.
All records strictly require user_id.
*/
export const deletionJobs = sqliteTable("deletion_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: text("notebook_id").references(() => notebooks.id, {
    onDelete: "cascade",
  }),
  level: text("level").notNull(),
  status: text("status").notNull(),
  progress: integer("progress").notNull().default(0),
  freedBytes: integer("freed_bytes"),
  deletedCounts: text("deleted_counts"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

/**
Memory rules persistent context instructions table.
All records strictly require user_id.
*/
export const memoryRules = sqliteTable("memory_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: text("notebook_id").references(() => notebooks.id, {
    onDelete: "cascade",
  }),
  ruleText: text("rule_text").notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

/**
Provider keys encrypted credentials storage table.
All records strictly require user_id.
*/
export const providerKeys = sqliteTable("provider_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  keyId: text("key_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  maskedKey: text("masked_key").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
Provider model selections table (Ticket 04, PRD D6/D7).
One row per (user_id, kind): chat and embedding models persist
independently, including custom typed model IDs.
All records strictly require user_id.
*/
export const providerModelSelections = sqliteTable(
  "provider_model_selections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    // Declared to mirror the hand-written DDL in model-selection-repository.ts
    // (ticket 28 parity: the same named index exists in schema/pg.ts).
    uniqueIndex("provider_model_selections_user_kind").on(
      table.userId,
      table.kind
    ),
  ]
);
