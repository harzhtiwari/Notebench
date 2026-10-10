import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * PostgreSQL Users account table.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  passcodeHash: text("passcode_hash"),
  role: varchar("role", { length: 50 }).notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Notebooks workspace container table.
 * All records strictly require user_id.
 */
export const notebooks = pgTable("notebooks", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Sources reference document table.
 * All records strictly require user_id.
 */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  url: text("url"),
  filePath: text("file_path"),
  mimeType: varchar("mime_type", { length: 100 }),
  byteSize: integer("byte_size"),
  contentHash: varchar("content_hash", { length: 128 }),
  tokenCount: integer("token_count"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Artifacts living deliverable AST index table.
 * All records strictly require user_id.
 */
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Artifact versions append-only history DAG table.
 * All records strictly require user_id.
 */
export const artifactVersions = pgTable("artifact_versions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  artifactId: uuid("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  createdBy: varchar("created_by", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }),
  instruction: text("instruction"),
  parentVersionId: uuid("parent_version_id"),
  content: text("content").notNull(),
  contentDigest: varchar("content_digest", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Sessions dual-token authentication table.
 * All records strictly require user_id.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/**
 * PostgreSQL Deletion jobs 6-level cascading deletion table.
 * All records strictly require user_id.
 */
export const deletionJobs = pgTable("deletion_jobs", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: uuid("notebook_id").references(() => notebooks.id, {
    onDelete: "cascade",
  }),
  level: varchar("level", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  progress: integer("progress").notNull().default(0),
  freedBytes: integer("freed_bytes"),
  deletedCounts: text("deleted_counts"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * PostgreSQL Memory rules persistent context instructions table.
 * All records strictly require user_id.
 */
export const memoryRules = pgTable("memory_rules", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notebookId: uuid("notebook_id").references(() => notebooks.id, {
    onDelete: "cascade",
  }),
  ruleText: text("rule_text").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
