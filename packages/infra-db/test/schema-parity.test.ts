import { describe, expect, it } from "vitest";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { pgSchema, sqliteSchema } from "../src/schema/index.js";

/**
 * Ticket 28 — declared-schema parity across the two dialects.
 *
 * The SQLite and PostgreSQL drizzle schemas must describe the same logical
 * schema: the same tables, the same columns, and the same named indexes.
 * `getTableConfig` reads the declarations themselves, so this test fails on
 * drift in `schema/sqlite.ts` or `schema/pg.ts` without needing a database.
 */

interface TableShape {
  columns: string[];
  indexes: { name: string; unique: boolean; columns: string[] }[];
}

/** Index columns may be column refs, raw SQL, or strings; only refs carry a name. */
function indexColumnName(column: unknown): string {
  if (typeof column === "string") {
    return column;
  }
  if (column !== null && typeof column === "object") {
    const candidate = column as { name?: unknown };
    if (typeof candidate.name === "string") {
      return candidate.name;
    }
  }
  return "";
}

function sqliteTableShape(tableName: string): TableShape {
  const table = sqliteSchema[tableName as keyof typeof sqliteSchema];
  if (!table) {
    throw new Error(`sqlite schema has no table named ${tableName}`);
  }
  const config = getSqliteTableConfig(table);
  return {
    columns: config.columns.map((column) => column.name).sort(),
    indexes: config.indexes
      .map((index) => ({
        name: index.config.name,
        unique: index.config.unique,
        columns: index.config.columns.map(indexColumnName).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function pgTableShape(tableName: string): TableShape {
  const table = pgSchema[tableName as keyof typeof pgSchema];
  if (!table) {
    throw new Error(`pg schema has no table named ${tableName}`);
  }
  const config = getPgTableConfig(table);
  return {
    columns: config.columns.map((column) => column.name).sort(),
    indexes: config.indexes
      .map((index) => ({
        name: index.config.name ?? "",
        unique: index.config.unique,
        columns: index.config.columns.map(indexColumnName).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

describe("Ticket 28 — declared schema parity (schema/sqlite.ts vs schema/pg.ts)", () => {
  const sqliteTableNames = Object.keys(sqliteSchema).sort();
  const pgTableNames = Object.keys(pgSchema).sort();

  it("declares the same table names in both dialects", () => {
    expect(pgTableNames).toEqual(sqliteTableNames);
  });

  it("declares the same column names for every shared table", () => {
    for (const tableName of sqliteTableNames) {
      expect(sqliteTableShape(tableName).columns, `columns of ${tableName}`).toEqual(
        pgTableShape(tableName).columns
      );
    }
  });

  it("declares the same index names for every shared table", () => {
    for (const tableName of sqliteTableNames) {
      expect(sqliteTableShape(tableName).indexes, `indexes of ${tableName}`).toEqual(
        pgTableShape(tableName).indexes
      );
    }
  });

  it("declares the provider_model_selections (user_id, kind) unique index in both dialects", () => {
    // Audit finding: the SQLite DDL creates this unique index
    // (model-selection-repository.ts) while schema/pg.ts did not declare it.
    const expected = {
      name: "provider_model_selections_user_kind",
      unique: true,
      columns: ["kind", "user_id"],
    };

    const sqliteIndex = sqliteTableShape("providerModelSelections").indexes.find(
      (index) => index.name === "provider_model_selections_user_kind"
    );
    expect(sqliteIndex, "SQLite declared index").toEqual(expected);

    const pgIndex = pgTableShape("providerModelSelections").indexes.find(
      (index) => index.name === "provider_model_selections_user_kind"
    );
    expect(pgIndex, "PostgreSQL declared index").toEqual(expected);
  });
});
