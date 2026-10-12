import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createSqliteDatabase, type SqliteDatabaseInstance } from "./connection.js";
import { SqliteArtifactVersionRepository } from "./artifact-repository.js";
import { sqliteSchema } from "../schema/index.js";

const USER_ID = randomUUID();
const NOTEBOOK_ID = randomUUID();
const ARTIFACT_ID = randomUUID();

describe("SqliteArtifactVersionRepository & Self-Referencing Foreign Key DAG", () => {
  let dbInstance: SqliteDatabaseInstance;
  let repo: SqliteArtifactVersionRepository;

  beforeEach(() => {
    dbInstance = createSqliteDatabase({ dbPath: ":memory:", foreignKeys: true });
    repo = new SqliteArtifactVersionRepository(dbInstance.db);

    // Initialize required schema tables in SQLite in-memory
    dbInstance.sqlite.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT,
        display_name TEXT,
        passcode_hash TEXT,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE notebooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        trashed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        current_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE artifact_versions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        model TEXT,
        instruction TEXT,
        parent_version_id TEXT REFERENCES artifact_versions(id),
        content TEXT NOT NULL,
        content_digest TEXT,
        created_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    // Seed prerequisite parent rows: user, notebook, artifact
    dbInstance.db.insert(sqliteSchema.users).values({
      id: USER_ID,
      email: "user@example.com",
      displayName: "Test User",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    }).run();

    dbInstance.db.insert(sqliteSchema.notebooks).values({
      id: NOTEBOOK_ID,
      userId: USER_ID,
      title: "Research Workspace",
      createdAt: now,
      updatedAt: now,
    }).run();

    dbInstance.db.insert(sqliteSchema.artifacts).values({
      id: ARTIFACT_ID,
      userId: USER_ID,
      notebookId: NOTEBOOK_ID,
      type: "report",
      title: "Quarterly Summary",
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    }).run();
  });

  afterEach(() => {
    dbInstance.close();
  });

  it("inserts initial version (v1) without parentVersionId", async () => {
    const v1 = await repo.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      number: 1,
      createdBy: "user",
      content: { schemaVersion: 1, blocks: [] },
      contentDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });

    expect(v1.number).toBe(1);
    expect(v1.parentVersionId).toBeUndefined();

    const fetched = await repo.getVersionById(v1.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(v1.id);
    expect(fetched?.number).toBe(1);
  });

  it("inserts child version (v2) with valid parentVersionId pointing to v1", async () => {
    const v1 = await repo.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      number: 1,
      createdBy: "user",
      content: { schemaVersion: 1, blocks: [] },
    });

    const v2 = await repo.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      number: 2,
      createdBy: "ai",
      model: "gpt-4o",
      instruction: "Add section 1",
      parentVersionId: v1.id,
      content: { schemaVersion: 1, blocks: [{ id: randomUUID(), kind: "heading", level: 1, text: "Section 1" }] },
    });

    expect(v2.number).toBe(2);
    expect(v2.parentVersionId).toBe(v1.id);

    const versions = await repo.listVersions(ARTIFACT_ID);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toBe(v1.id);
    expect(versions[1]?.id).toBe(v2.id);

    const latest = await repo.getLatestVersion(ARTIFACT_ID);
    expect(latest?.id).toBe(v2.id);
  });

  it("enforces self-referencing foreign key constraint: fails when parentVersionId does not exist", async () => {
    const fakeParentId = randomUUID();

    await expect(
      repo.createVersion({
        artifactId: ARTIFACT_ID,
        userId: USER_ID,
        number: 1,
        createdBy: "user",
        parentVersionId: fakeParentId, // Foreign key failure!
        content: { schemaVersion: 1, blocks: [] },
      })
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});
