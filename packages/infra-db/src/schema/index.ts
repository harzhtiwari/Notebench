import * as sqliteSchema from "./sqlite.js";
import * as pgSchema from "./pg.js";

export { sqliteSchema, pgSchema };

/**
 * Canonical list of all tables owned by users where user_id is mandatory.
 */
export const USER_OWNED_TABLE_NAMES = [
  "notebooks",
  "sources",
  "artifacts",
  "artifactVersions",
  "sessions",
  "deletionJobs",
  "memoryRules",
] as const;

export type UserOwnedTableName = (typeof USER_OWNED_TABLE_NAMES)[number];
