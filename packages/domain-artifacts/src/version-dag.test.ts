import { describe, it, expect } from "vitest";
import {
  InvarianceViolationError,
  type DocumentContent,
} from "@notebench/contracts";
import {
  ArtifactVersionDagService,
  InMemoryArtifactVersionRepository,
} from "./index.js";

const ARTIFACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const BLOCK_1 = "11111111-1111-4111-8111-111111111111";
const BLOCK_2 = "22222222-2222-4222-8222-222222222222";
const BLOCK_3 = "33333333-3333-4333-8333-333333333333";

function createInitialDoc(): DocumentContent {
  return {
    schemaVersion: 1,
    blocks: [
      { id: BLOCK_1, kind: "heading", level: 1, text: "Section 1" },
      { id: BLOCK_2, kind: "paragraph", text: "Original paragraph text", citations: [] },
      { id: BLOCK_3, kind: "heading", level: 2, text: "Section 2" },
    ],
  };
}

describe("Artifact Version DAG & Surgical Patch Service (Ticket 12 RED suite)", () => {
  it("creates initial version with number 1 and no parentVersionId", async () => {
    const repo = new InMemoryArtifactVersionRepository();
    const service = new ArtifactVersionDagService(repo);

    const v1 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      content: createInitialDoc(),
    });

    expect(v1.number).toBe(1);
    expect(v1.parentVersionId).toBeUndefined();
    expect(v1.contentDigest).toBeDefined();
    expect(v1.contentDigest).toHaveLength(64);

    const all = await service.listVersions(ARTIFACT_ID);
    expect(all).toHaveLength(1);
    const firstVersion = all[0];
    expect(firstVersion).toBeDefined();
    if (firstVersion) {
      expect(firstVersion.id).toBe(v1.id);
    }
  });

  it("appends subsequent versions incrementing number and tracking parentVersionId", async () => {
    const repo = new InMemoryArtifactVersionRepository();
    const service = new ArtifactVersionDagService(repo);

    const v1 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      content: createInitialDoc(),
    });

    const modifiedDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: BLOCK_1, kind: "heading", level: 1, text: "Section 1 Updated" },
        { id: BLOCK_2, kind: "paragraph", text: "Original paragraph text", citations: [] },
        { id: BLOCK_3, kind: "heading", level: 2, text: "Section 2" },
      ],
    };

    const v2 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      parentVersionId: v1.id,
      content: modifiedDoc,
    });

    expect(v2.number).toBe(2);
    expect(v2.parentVersionId).toBe(v1.id);

    const versions = await service.listVersions(ARTIFACT_ID);
    expect(versions).toHaveLength(2);
    const version0 = versions[0];
    const version1 = versions[1];
    expect(version0).toBeDefined();
    expect(version1).toBeDefined();
    if (version0 && version1) {
      expect(version0.id).toBe(v1.id);
      expect(version1.id).toBe(v2.id);
    }
  });

  it("restores old version git-style: content equals the target, parent points at latest", async () => {
    const repo = new InMemoryArtifactVersionRepository();
    const service = new ArtifactVersionDagService(repo);

    const v1 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      content: createInitialDoc(),
    });

    const v2 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      parentVersionId: v1.id,
      content: {
        schemaVersion: 1,
        blocks: [
          { id: BLOCK_1, kind: "heading", level: 1, text: "Completely Changed Heading" },
        ],
      },
    });

    // Restore v1
    const v3 = await service.restoreVersion(ARTIFACT_ID, v1.id, {
      userId: USER_ID,
    });

    expect(v3.number).toBe(3);
    // Git-style restore (spec 4.3): new row content equals the target, but the
    // parent stays on latest so history remains linear: V3 → V2 → V1.
    expect(v3.parentVersionId).toBe(v2.id);
    expect(v3.content).toEqual(v1.content);
    expect(v3.contentDigest).toBe(v1.contentDigest);

    // Old versions are completely preserved and untouched
    const v1Fresh = await service.getVersion(v1.id);
    const v2Fresh = await service.getVersion(v2.id);
    expect(v1Fresh?.content).toEqual(v1.content);
    expect(v2Fresh?.number).toBe(2);

    const all = await service.listVersions(ARTIFACT_ID);
    expect(all).toHaveLength(3);
  });

  it("applies surgical block patch, verifying sibling invariance and committing new version", async () => {
    const repo = new InMemoryArtifactVersionRepository();
    const service = new ArtifactVersionDagService(repo);

    const v1 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      content: createInitialDoc(),
    });

    const v2 = await service.applySurgicalPatch({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      baseVersionId: v1.id,
      targetId: BLOCK_2,
      replacement: {
        id: BLOCK_2,
        kind: "paragraph",
        text: "Surgically updated paragraph",
        citations: [],
      },
      instruction: "Updated paragraph 2",
    });

    expect(v2.number).toBe(2);
    expect(v2.parentVersionId).toBe(v1.id);
    const doc = v2.content as DocumentContent;
    const b0 = doc.blocks[0];
    const b1 = doc.blocks[1];
    const b2 = doc.blocks[2];
    expect(b0).toBeDefined();
    expect(b1).toBeDefined();
    expect(b2).toBeDefined();
    if (b0 && "text" in b0) expect(b0.text).toBe("Section 1"); // Sibling 1 bit-for-bit identical
    if (b1 && "text" in b1) expect(b1.text).toBe("Surgically updated paragraph");
    if (b2 && "text" in b2) expect(b2.text).toBe("Section 2"); // Sibling 3 bit-for-bit identical
  });

  it("throws INVARIANCE_VIOLATION and writes NOTHING to DAG if sibling is modified", async () => {
    const repo = new InMemoryArtifactVersionRepository();
    const service = new ArtifactVersionDagService(repo);

    const v1 = await service.createVersion({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      createdBy: "user",
      content: createInitialDoc(),
    });

    // Provide a tainted proposed update where sibling BLOCK_1 had 1 character changed
    const taintedDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: BLOCK_1, kind: "heading", level: 1, text: "Section 1!" }, // Tainted sibling!
        { id: BLOCK_2, kind: "paragraph", text: "New text", citations: [] },
        { id: BLOCK_3, kind: "heading", level: 2, text: "Section 2" },
      ],
    };

    await expect(
      service.applyProposedContent({
        artifactId: ARTIFACT_ID,
        userId: USER_ID,
        baseVersionId: v1.id,
        targetId: BLOCK_2,
        proposedContent: taintedDoc,
      })
    ).rejects.toThrowError(InvarianceViolationError);

    // Verify invariance defense: NOTHING was written!
    const all = await service.listVersions(ARTIFACT_ID);
    expect(all).toHaveLength(1);
    const vOnly = all[0];
    expect(vOnly).toBeDefined();
    if (vOnly) {
      expect(vOnly.id).toBe(v1.id);
    }
  });
});
