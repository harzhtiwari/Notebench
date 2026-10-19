import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSqliteDatabase, type SqliteDatabaseInstance } from "./connection.js";
import { SqliteNotebookRepository, initializeSqliteSchema } from "./notebook-repository.js";
import { NotFoundError } from "@notebench/contracts";

describe("SqliteNotebookRepository (Ticket 05 CRUD & Duplicate)", () => {
  let dbInstance: SqliteDatabaseInstance;
  let repo: SqliteNotebookRepository;
  const userId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "99999999-9999-4999-8999-999999999999";

  beforeEach(() => {
    dbInstance = createSqliteDatabase({ dbPath: ":memory:" });
    initializeSqliteSchema(dbInstance.sqlite);

    // Seed test users
    const now = new Date().toISOString();
    dbInstance.sqlite.exec(`
      INSERT INTO users (id, email, display_name, role, created_at, updated_at)
      VALUES 
        ('${userId}', 'owner@notebench.local', 'Owner User', 'owner', '${now}', '${now}'),
        ('${otherUserId}', 'other@notebench.local', 'Other User', 'owner', '${now}', '${now}');
    `);

    repo = new SqliteNotebookRepository(dbInstance.db, dbInstance.sqlite);
  });

  afterEach(() => {
    dbInstance.close();
  });

  describe("create and findById", () => {
    it("creates a notebook with generated UUID and returns it", async () => {
      const created = await repo.create(userId, { title: "Research Notebook" });
      expect(created.id).toBeDefined();
      expect(created.userId).toBe(userId);
      expect(created.title).toBe("Research Notebook");
      expect(created.trashedAt).toBeNull();
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();

      const found = await repo.findById(created.id, userId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe("Research Notebook");
    });

    it("returns null when notebook belongs to another user", async () => {
      const created = await repo.create(userId, { title: "Private Notebook" });
      const found = await repo.findById(created.id, otherUserId);
      expect(found).toBeNull();
    });
  });

  describe("update (inline rename and soft trash)", () => {
    it("renames notebook and updates updatedAt", async () => {
      const created = await repo.create(userId, { title: "Draft Title" });
      const updated = await repo.update(created.id, userId, { title: "Finalized Title" });

      expect(updated.title).toBe("Finalized Title");
      expect(updated.id).toBe(created.id);

      const found = await repo.findById(created.id, userId);
      expect(found?.title).toBe("Finalized Title");
    });

    it("throws NotFoundError when updating non-existent notebook", async () => {
      await expect(
        repo.update("00000000-0000-4000-8000-000000000000", userId, { title: "Ghost" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("listSummaries", () => {
    it("lists notebooks with aggregated counts, storageBytes, and sourceFileNames", async () => {
      const nb = await repo.create(userId, { title: "ML Studies" });
      const now = new Date().toISOString();

      // Seed sources under notebook
      dbInstance.sqlite.exec(`
        INSERT INTO sources (id, user_id, notebook_id, title, type, file_path, byte_size, created_at, updated_at)
        VALUES 
          ('33333333-3333-4333-8333-333333333331', '${userId}', '${nb.id}', 'AttentionIsAllYouNeed.pdf', 'pdf', '/uploads/att.pdf', 1048576, '${now}', '${now}'),
          ('33333333-3333-4333-8333-333333333332', '${userId}', '${nb.id}', 'Notes.md', 'md', '/uploads/notes.md', 2048, '${now}', '${now}');
      `);

      // Seed artifact under notebook
      dbInstance.sqlite.exec(`
        INSERT INTO artifacts (id, user_id, notebook_id, type, title, schema_version, created_at, updated_at)
        VALUES 
          ('55555555-5555-4555-8555-555555555551', '${userId}', '${nb.id}', 'study_guide', 'Transformers Study Guide', 1, '${now}', '${now}');
      `);

      const summaries = await repo.listSummaries(userId);
      expect(summaries).toHaveLength(1);
      const summary = summaries[0];
      expect(summary?.id).toBe(nb.id);
      expect(summary?.title).toBe("ML Studies");
      expect(summary?.sourcesCount).toBe(2);
      expect(summary?.artifactsCount).toBe(1);
      expect(summary?.storageBytes).toBe(1_048_576 + 2048);
      expect(summary?.sourceFileNames).toEqual(["AttentionIsAllYouNeed.pdf", "Notes.md"]);
    });

    it("excludes soft-trashed notebooks from listSummaries", async () => {
      const active = await repo.create(userId, { title: "Active Notebook" });
      const trashed = await repo.create(userId, { title: "Trashed Notebook" });
      await repo.update(trashed.id, userId, { trashedAt: new Date().toISOString() });

      const summaries = await repo.listSummaries(userId);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe(active.id);
    });
  });

  describe("duplicate (B4 / Coverage Gap Closed)", () => {
    it("duplicates notebook creating fresh rows with new IDs for sources and artifacts only, without copying chat history or memory rules", async () => {
      // Ticket 05 section 7 also calls for chunks and vectors to be copied,
      // but no chunk/embedding tables exist yet (ingestion storage is
      // unbuilt). This test intentionally covers sources + artifacts only.
      const original = await repo.create(userId, { title: "Physics 101" });
      const now = new Date().toISOString();

      // Seed source
      const sourceId = "33333333-3333-4333-8333-333333333333";
      dbInstance.sqlite.exec(`
        INSERT INTO sources (id, user_id, notebook_id, title, type, file_path, content_hash, byte_size, created_at, updated_at)
        VALUES ('${sourceId}', '${userId}', '${original.id}', 'Mechanics.pdf', 'pdf', '/uploads/mech.pdf', 'hash-123', 500000, '${now}', '${now}');
      `);

      // Seed artifact with a version chain (v2 derived from v1)
      const artifactId = "55555555-5555-4555-8555-555555555555";
      const versionIdV1 = "66666666-6666-4666-8666-666666666666";
      const versionIdV2 = "66666666-6666-4666-8666-666666666667";
      dbInstance.sqlite.exec(`
        INSERT INTO artifacts (id, user_id, notebook_id, type, title, schema_version, current_version_id, created_at, updated_at)
        VALUES ('${artifactId}', '${userId}', '${original.id}', 'quiz', 'Kinematics Quiz', 1, '${versionIdV2}', '${now}', '${now}');
        INSERT INTO artifact_versions (id, user_id, artifact_id, number, created_by, parent_version_id, content, created_at)
        VALUES ('${versionIdV1}', '${userId}', '${artifactId}', 1, 'user', NULL, '{"questions":[]}', '${now}');
        INSERT INTO artifact_versions (id, user_id, artifact_id, number, created_by, parent_version_id, content, created_at)
        VALUES ('${versionIdV2}', '${userId}', '${artifactId}', 2, 'ai', '${versionIdV1}', '{"questions":[{"id":"q1"}]}', '${now}');
      `);

      // Seed memory rule (must NOT be duplicated)
      dbInstance.sqlite.exec(`
        INSERT INTO memory_rules (id, user_id, notebook_id, rule_text, is_active, created_at)
        VALUES ('rule-1', '${userId}', '${original.id}', 'Always explain simply', 1, '${now}');
      `);

      // Duplicate notebook
      const duplicated = await repo.duplicate(original.id, userId);

      expect(duplicated.id).toBeDefined();
      expect(duplicated.id).not.toBe(original.id);
      expect(duplicated.title).toBe("Copy of Physics 101");

      // Verify sources of duplicated notebook: fresh row, same count/content
      const dupSources = dbInstance.sqlite
        .prepare("SELECT * FROM sources WHERE notebook_id = ?")
        .all(duplicated.id) as {
          id: string;
          title: string;
          content_hash: string;
          byte_size: number;
        }[];
      expect(dupSources).toHaveLength(1);
      expect(dupSources[0]?.id).not.toBe(sourceId);
      expect(dupSources[0]?.title).toBe("Mechanics.pdf");
      expect(dupSources[0]?.content_hash).toBe("hash-123");
      expect(dupSources[0]?.byte_size).toBe(500_000);

      // Verify artifacts and version DAG of duplicated notebook
      const dupArtifacts = dbInstance.sqlite
        .prepare("SELECT * FROM artifacts WHERE notebook_id = ?")
        .all(duplicated.id) as { id: string; title: string; current_version_id: string }[];
      expect(dupArtifacts).toHaveLength(1);
      expect(dupArtifacts[0]?.id).not.toBe(artifactId);
      expect(dupArtifacts[0]?.title).toBe("Kinematics Quiz");

      const dupVersions = dbInstance.sqlite
        .prepare("SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY number ASC")
        .all(dupArtifacts[0]?.id) as {
          id: string;
          number: number;
          parent_version_id: string | null;
          content: string;
        }[];
      expect(dupVersions).toHaveLength(2);
      expect(dupVersions[0]?.id).not.toBe(versionIdV1);
      expect(dupVersions[0]?.parent_version_id).toBeNull();
      expect(dupVersions[1]?.id).not.toBe(versionIdV2);
      expect(dupVersions[1]?.parent_version_id).toBe(dupVersions[0]?.id);
      expect(dupVersions[0]?.content).toBe('{"questions":[]}');
      expect(dupVersions[1]?.content).toBe('{"questions":[{"id":"q1"}]}');
      expect(dupArtifacts[0]?.current_version_id).toBe(dupVersions[1]?.id);

      // The original rows were copied, not moved
      const originalCounts = dbInstance.sqlite
        .prepare(`
          SELECT
            (SELECT COUNT(*) FROM sources WHERE notebook_id = ?) AS sources,
            (SELECT COUNT(*) FROM artifacts WHERE notebook_id = ?) AS artifacts
        `)
        .get(original.id, original.id) as { sources: number; artifacts: number };
      expect(originalCounts.sources).toBe(1);
      expect(originalCounts.artifacts).toBe(1);

      // Verify memory rules were NOT copied
      const dupRules = dbInstance.sqlite
        .prepare("SELECT * FROM memory_rules WHERE notebook_id = ?")
        .all(duplicated.id);
      expect(dupRules).toHaveLength(0);
    });
  });

  describe("artifact_versions self-referencing FK (bootstrapped schema)", () => {
    it("declares parent_version_id REFERENCES artifact_versions(id) and enables foreign keys", () => {
      expect(dbInstance.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);

      const foreignKeys = dbInstance.sqlite.pragma(
        "foreign_key_list(artifact_versions)"
      ) as { table: string; from: string; to: string }[];

      expect(foreignKeys).toContainEqual(
        expect.objectContaining({
          table: "artifact_versions",
          from: "parent_version_id",
          to: "id",
        })
      );
    });

    it("rejects a version whose parent_version_id does not exist", async () => {
      const nb = await repo.create(userId, { title: "FK Probe" });
      const now = new Date().toISOString();
      const artifactId = "77777777-7777-4777-8777-777777777777";

      dbInstance.sqlite.exec(`
        INSERT INTO artifacts (id, user_id, notebook_id, type, title, created_at, updated_at)
        VALUES ('${artifactId}', '${userId}', '${nb.id}', 'report', 'FK Probe Artifact', '${now}', '${now}');
      `);

      expect(() =>
        dbInstance.sqlite.exec(`
          INSERT INTO artifact_versions (id, user_id, artifact_id, number, created_by, parent_version_id, content, created_at)
          VALUES ('88888888-8888-4888-8888-888888888888', '${userId}', '${artifactId}', 1, 'user', '99999999-9999-4999-8999-999999999999', '{}', '${now}');
        `)
      ).toThrow(/FOREIGN KEY/i);
    });
  });

  describe("getMetrics (Decision 1.34)", () => {
    it("computes instance metrics across active notebooks, sources, and artifacts", async () => {
      const nb1 = await repo.create(userId, { title: "Nb 1" });
      const nb2 = await repo.create(userId, { title: "Nb 2" });
      const now = new Date().toISOString();

      dbInstance.sqlite.exec(`
        INSERT INTO sources (id, user_id, notebook_id, title, type, byte_size, created_at, updated_at)
        VALUES 
          ('src-1', '${userId}', '${nb1.id}', 'doc1.pdf', 'pdf', 1000000, '${now}', '${now}'),
          ('src-2', '${userId}', '${nb2.id}', 'doc2.pdf', 'pdf', 2500000, '${now}', '${now}');
        INSERT INTO artifacts (id, user_id, notebook_id, type, title, created_at, updated_at)
        VALUES ('art-1', '${userId}', '${nb1.id}', 'report', 'Report 1', '${now}', '${now}');
      `);

      const metrics = await repo.getMetrics(userId);
      expect(metrics.notebookCount).toBe(2);
      expect(metrics.sourceCount).toBe(2);
      expect(metrics.artifactCount).toBe(1);
      expect(metrics.storageUsedBytes).toBe(3_500_000);
      expect(metrics.storageSafeCapBytes).toBe(5 * 1024 * 1024 * 1024);
    });
  });
});
