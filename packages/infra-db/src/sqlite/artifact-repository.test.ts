import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createSqliteDatabase, type SqliteDatabaseInstance } from "./connection.js";
import { SqliteArtifactVersionRepository } from "./artifact-repository.js";
import { initializeSqliteSchema } from "./notebook-repository.js";
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

    // Bootstrap the SAME schema production creates (initializeSqliteSchema) so
    // the self-FK under test is the one the runtime DDL actually declares.
    initializeSqliteSchema(dbInstance.sqlite);

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
    const content = { schemaVersion: 1, blocks: [] };
    // RFC 8785 canonical form of `content` above (keys sorted, no whitespace):
    // {"blocks":[],"schemaVersion":1}. The digest must be the real SHA-256 of
    // the stored content — never the digest of the empty string.
    const expectedDigest = createHash("sha256")
      .update('{"blocks":[],"schemaVersion":1}', "utf8")
      .digest("hex");

    const v1 = await repo.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      number: 1,
      createdBy: "user",
      content,
      contentDigest: expectedDigest,
    });

    expect(v1.number).toBe(1);
    expect(v1.parentVersionId).toBeUndefined();
    expect(v1.contentDigest).toBe(expectedDigest);

    const fetched = await repo.getVersionById(v1.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(v1.id);
    expect(fetched?.number).toBe(1);
    expect(fetched?.contentDigest).toBe(expectedDigest);
  });

  it("declares the artifact_versions self-FK in the production bootstrap DDL", () => {
    const foreignKeys = dbInstance.sqlite.pragma("foreign_key_list(artifact_versions)") as Array<{
      table: string;
      from: string;
      to: string;
    }>;
    const selfFk = foreignKeys.find(
      (fk) => fk.table === "artifact_versions" && fk.from === "parent_version_id"
    );
    expect(selfFk).toBeDefined();
    expect(selfFk?.to).toBe("id");
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
