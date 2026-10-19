import { describe, it, expect } from "vitest";
import {
  InvarianceViolationError,
  type DocumentContent,
  type FlashcardsContent,
} from "@notebench/contracts";
import {
  computeNodeDigest,
  verifySiblingInvariance,
  applySurgicalPatch,
} from "./invariance.js";

const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";
const VALID_UUID_3 = "33333333-3333-4333-8333-333333333333";

describe("RFC 8785 (JCS) SHA-256 Cryptographic Sibling Invariance (Decision 4.2, 4.6)", () => {
  it("produces identical SHA-256 digest regardless of object key order (JCS property)", () => {
    const objA = {
      id: VALID_UUID_1,
      kind: "heading",
      level: 1,
      text: "Deterministic JCS",
      locked: false,
    };

    const objB = {
      locked: false,
      text: "Deterministic JCS",
      level: 1,
      id: VALID_UUID_1,
      kind: "heading",
    };

    const digestA = computeNodeDigest(objA);
    const digestB = computeNodeDigest(objB);

    expect(digestA).toHaveLength(64);
    expect(digestA).toBe(digestB);
  });

  it("produces distinct digests when content differs by a single character", () => {
    const block1 = {
      id: VALID_UUID_1,
      kind: "paragraph" as const,
      text: "The quick brown fox",
      citations: [],
    };
    const block2 = {
      id: VALID_UUID_1,
      kind: "paragraph" as const,
      text: "The quick brown fox.",
      citations: [],
    };

    expect(computeNodeDigest(block1)).not.toBe(computeNodeDigest(block2));
  });

  it("passes sibling invariance when exactly target block is modified and siblings are identical", () => {
    const currentDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph original", citations: [] },
        { id: VALID_UUID_3, kind: "heading", level: 2, text: "Heading 2" },
      ],
    };

    const proposedDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph MODIFIED", citations: [] },
        { id: VALID_UUID_3, kind: "heading", level: 2, text: "Heading 2" },
      ],
    };

    expect(() => { verifySiblingInvariance(currentDoc, proposedDoc, VALID_UUID_2); }
    ).not.toThrow();

    const patched = applySurgicalPatch(currentDoc, {
      targetId: VALID_UUID_2,
      replacement: {
        id: VALID_UUID_2,
        kind: "paragraph",
        text: "Paragraph MODIFIED",
        citations: [],
      },
    });

    expect(patched.blocks[1]).toEqual({
      id: VALID_UUID_2,
      kind: "paragraph",
      text: "Paragraph MODIFIED",
      citations: [],
    });
  });

  it("throws INVARIANCE_VIOLATION when a sibling block changes by a single character", () => {
    const currentDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph original", citations: [] },
        { id: VALID_UUID_3, kind: "heading", level: 2, text: "Heading 2" },
      ],
    };

    // In taintedDoc, target VALID_UUID_2 is updated, but sibling VALID_UUID_1 had 1 character changed ("Heading 1" -> "Heading !")
    const taintedDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading !" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph updated", citations: [] },
        { id: VALID_UUID_3, kind: "heading", level: 2, text: "Heading 2" },
      ],
    };

    expect(() => { verifySiblingInvariance(currentDoc, taintedDoc, VALID_UUID_2); }
    ).toThrow(InvarianceViolationError);

    try {
      verifySiblingInvariance(currentDoc, taintedDoc, VALID_UUID_2);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvarianceViolationError);
      expect((error as InvarianceViolationError).code).toBe("INVARIANCE_VIOLATION");
    }
  });

  it("throws INVARIANCE_VIOLATION when a sibling block is unexpectedly added or removed", () => {
    const currentDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph", citations: [] },
      ],
    };

    // Truncated doc deleted sibling VALID_UUID_1
    const truncatedDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph updated", citations: [] },
      ],
    };

    expect(() => { verifySiblingInvariance(currentDoc, truncatedDoc, VALID_UUID_2); }
    ).toThrow(InvarianceViolationError);
  });

  it("applies surgical patch and invariance uniformly across flashcards and quizzes (reuse rule)", () => {
    const flashcards: FlashcardsContent = {
      schemaVersion: 1,
      cards: [
        { id: VALID_UUID_1, front: "F1", back: "B1", citations: [] },
        { id: VALID_UUID_2, front: "F2", back: "B2", citations: [] },
      ],
    };

    const updatedFc = applySurgicalPatch(flashcards, {
      targetId: VALID_UUID_1,
      replacement: { id: VALID_UUID_1, front: "F1 updated", back: "B1", citations: [] },
    });

    const card0 = updatedFc.cards[0];
    const card1 = updatedFc.cards[1];
    expect(card0).toBeDefined();
    expect(card1).toBeDefined();
    if (!(card0 && card1)) {
      return;
    }

    expect(card0.front).toBe("F1 updated");
    expect(card1.front).toBe("F2");
  });

  it("enforces expectedPreHash: rejects a stale target digest, accepts a matching one", () => {
    const currentDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph original", citations: [] },
      ],
    };
    const target = currentDoc.blocks[1];
    if (!target) throw new Error("fixture missing target block");

    const replacement = {
      id: VALID_UUID_2,
      kind: "paragraph",
      text: "Paragraph updated",
      citations: [],
    };

    expect(() =>
      applySurgicalPatch(currentDoc, {
        targetId: VALID_UUID_2,
        replacement,
        expectedPreHash: "0".repeat(64),
      })
    ).toThrow(InvarianceViolationError);

    const patched = applySurgicalPatch(currentDoc, {
      targetId: VALID_UUID_2,
      replacement,
      expectedPreHash: computeNodeDigest(target),
    });
    expect(patched.blocks[1]).toMatchObject({ text: "Paragraph updated" });
  });

  it("enforces expectedSiblingHashes: rejects a stale sibling digest, accepts matching ones", () => {
    const currentDoc: DocumentContent = {
      schemaVersion: 1,
      blocks: [
        { id: VALID_UUID_1, kind: "heading", level: 1, text: "Heading 1" },
        { id: VALID_UUID_2, kind: "paragraph", text: "Paragraph original", citations: [] },
      ],
    };
    const sibling = currentDoc.blocks[0];
    if (!sibling) throw new Error("fixture missing sibling block");

    const replacement = {
      id: VALID_UUID_2,
      kind: "paragraph",
      text: "Paragraph updated",
      citations: [],
    };

    expect(() =>
      applySurgicalPatch(currentDoc, {
        targetId: VALID_UUID_2,
        replacement,
        expectedSiblingHashes: { [VALID_UUID_1]: "f".repeat(64) },
      })
    ).toThrow(InvarianceViolationError);

    const patched = applySurgicalPatch(currentDoc, {
      targetId: VALID_UUID_2,
      replacement,
      expectedSiblingHashes: { [VALID_UUID_1]: computeNodeDigest(sibling) },
    });
    expect(patched.blocks[1]).toMatchObject({ text: "Paragraph updated" });
  });
});
