import { describe, it, expect } from "vitest";
import {
  sqliteSchema,
  pgSchema,
  USER_OWNED_TABLE_NAMES,
} from "./index.js";

describe("Database Schemas & user_id Invariant", () => {
  it("defines all canonical user-owned tables in USER_OWNED_TABLE_NAMES", () => {
    expect(USER_OWNED_TABLE_NAMES).toContain("notebooks");
    expect(USER_OWNED_TABLE_NAMES).toContain("sources");
    expect(USER_OWNED_TABLE_NAMES).toContain("artifacts");
    expect(USER_OWNED_TABLE_NAMES).toContain("artifactVersions");
    expect(USER_OWNED_TABLE_NAMES).toContain("sessions");
    expect(USER_OWNED_TABLE_NAMES).toContain("deletionJobs");
    expect(USER_OWNED_TABLE_NAMES).toContain("memoryRules");
  });

  describe("SQLite Schema", () => {
    it("exports all required entities in sqliteSchema", () => {
      expect(sqliteSchema.users).toBeDefined();
      expect(sqliteSchema.notebooks).toBeDefined();
      expect(sqliteSchema.sources).toBeDefined();
      expect(sqliteSchema.artifacts).toBeDefined();
      expect(sqliteSchema.artifactVersions).toBeDefined();
      expect(sqliteSchema.sessions).toBeDefined();
      expect(sqliteSchema.deletionJobs).toBeDefined();
      expect(sqliteSchema.memoryRules).toBeDefined();
    });

    it("enforces required (NOT NULL) userId on all user-owned SQLite tables", () => {
      for (const tableName of USER_OWNED_TABLE_NAMES) {
        const table = sqliteSchema[tableName];
        expect(table, `Table ${tableName} must exist in sqliteSchema`).toBeDefined();
        expect(table.userId, `Table ${tableName} must contain 'userId'`).toBeDefined();
        expect(table.userId.notNull, `Table ${tableName}.userId must be NOT NULL`).toBe(true);
      }
    });
  });

  describe("PostgreSQL Schema", () => {
    it("exports all required entities in pgSchema", () => {
      expect(pgSchema.users).toBeDefined();
      expect(pgSchema.notebooks).toBeDefined();
      expect(pgSchema.sources).toBeDefined();
      expect(pgSchema.artifacts).toBeDefined();
      expect(pgSchema.artifactVersions).toBeDefined();
      expect(pgSchema.sessions).toBeDefined();
      expect(pgSchema.deletionJobs).toBeDefined();
      expect(pgSchema.memoryRules).toBeDefined();
    });

    it("enforces required (NOT NULL) userId on all user-owned PostgreSQL tables", () => {
      for (const tableName of USER_OWNED_TABLE_NAMES) {
        const table = pgSchema[tableName];
        expect(table, `Table ${tableName} must exist in pgSchema`).toBeDefined();
        expect(table.userId, `Table ${tableName} must contain 'userId'`).toBeDefined();
        expect(table.userId.notNull, `Table ${tableName}.userId must be NOT NULL`).toBe(true);
      }
    });
  });
});
