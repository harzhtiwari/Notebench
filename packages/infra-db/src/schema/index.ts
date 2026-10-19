/**
Canonical list of all tables owned by users where user_id is mandatory.
*/
export const USER_OWNED_TABLE_NAMES = [
  "notebooks",
  "sources",
  "artifacts",
  "artifactVersions",
  "sessions",
  "deletionJobs",
  "memoryRules",
  "providerKeys",
  "providerModelSelections",
] as const;

export type UserOwnedTableName = (typeof USER_OWNED_TABLE_NAMES)[number];

export * as sqliteSchema from "./sqlite.js";
export * as pgSchema from "./pg.js";