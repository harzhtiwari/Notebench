import { createHash } from "node:crypto";
import { canonicalizeJson } from "./jcs.js";
import {
  type ArtifactContent,
  InvarianceViolationError,
} from "@notebook/contracts";

/**
 * Computes deterministic RFC 8785 (JCS) SHA-256 digest of any JSON-serializable node.
 */
export function computeNodeDigest(node: unknown): string {
  if (node === undefined) {
    throw new InvarianceViolationError("Cannot compute digest of undefined value");
  }

  const canonical = canonicalizeJson(node);

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Extracts addressable item nodes from any living artifact content type (Decision 4.1, 4.6, C.3.2).
 */
export function getContentItems(
  content: ArtifactContent | Record<string, unknown>
): Array<{ id: string }> {
  if ("blocks" in content && Array.isArray(content.blocks)) {
    return content.blocks as Array<{ id: string }>;
  }
  if ("cards" in content && Array.isArray(content.cards)) {
    return content.cards as Array<{ id: string }>;
  }
  if ("questions" in content && Array.isArray(content.questions)) {
    return content.questions as Array<{ id: string }>;
  }
  if ("events" in content && Array.isArray(content.events)) {
    return content.events as Array<{ id: string }>;
  }
  if ("slides" in content && Array.isArray(content.slides)) {
    return content.slides as Array<{ id: string }>;
  }
  throw new InvarianceViolationError("Unrecognized artifact content shape: cannot locate addressable items");
}

/**
 * Computes a map of id -> SHA-256 JCS digests for a list of identifiable nodes.
 */
export function computeSiblingDigests(
  items: Array<{ id: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.id, computeNodeDigest(item));
  }
  return map;
}

/**
 * Asserts bit-for-bit sibling invariance between pre-patch and post-patch content trees (Decision 4.2, 4.6).
 * Untouched sibling nodes must remain bit-for-bit identical via RFC 8785 SHA-256 digests.
 *
 * Throws InvarianceViolationError on ANY mismatch.
 */
export function verifySiblingInvariance<T extends ArtifactContent>(
  currentContent: T,
  proposedContent: T,
  targetId: string
): void {
  const currentItems = getContentItems(currentContent);
  const proposedItems = getContentItems(proposedContent);

  const targetInCurrent = currentItems.find((item) => item.id === targetId);
  if (!targetInCurrent) {
    throw new InvarianceViolationError(
      `Invariance check failed: target node '${targetId}' does not exist in current content`,
      { targetId }
    );
  }

  const targetInProposed = proposedItems.find((item) => item.id === targetId);
  if (!targetInProposed) {
    throw new InvarianceViolationError(
      `Invariance check failed: target node '${targetId}' missing from proposed content`,
      { targetId }
    );
  }

  const currentSiblings = currentItems.filter((item) => item.id !== targetId);
  const proposedSiblings = proposedItems.filter((item) => item.id !== targetId);

  if (currentSiblings.length !== proposedSiblings.length) {
    throw new InvarianceViolationError(
      `Invariance check failed: sibling count mismatch (expected ${currentSiblings.length}, got ${proposedSiblings.length})`,
      {
        targetId,
        expectedCount: currentSiblings.length,
        receivedCount: proposedSiblings.length,
      }
    );
  }

  for (let i = 0; i < currentSiblings.length; i++) {
    const currentSib = currentSiblings[i];
    const proposedSib = proposedSiblings[i];

    if (!currentSib || !proposedSib) {
      throw new InvarianceViolationError("Invariance check failed: sibling index out of bounds", {
        targetId,
        index: i,
      });
    }

    if (currentSib.id !== proposedSib.id) {
      throw new InvarianceViolationError(
        `Invariance check failed: sibling order or identity mismatch at position ${i} (expected '${currentSib.id}', got '${proposedSib.id}')`,
        { targetId, expectedSiblingId: currentSib.id, receivedSiblingId: proposedSib.id }
      );
    }

    const preDigest = computeNodeDigest(currentSib);
    const postDigest = computeNodeDigest(proposedSib);

    if (preDigest !== postDigest) {
      throw new InvarianceViolationError(
        `Invariance check failed: sibling '${currentSib.id}' was mutated (pre: ${preDigest}, post: ${postDigest})`,
        {
          targetId,
          mutatedSiblingId: currentSib.id,
          preDigest,
          postDigest,
        }
      );
    }
  }
}

/**
 * Patch description for surgical block editing.
 */
export interface SurgicalPatch {
  targetId: string;
  replacement: { id: string } & Record<string, unknown>;
  expectedPreHash?: string | undefined;
  expectedSiblingHashes?: Record<string, string> | undefined;
}

/**
 * Applies a surgical update to an artifact tree while cryptographically enforcing sibling invariance (Decisions 4.2, 4.6).
 * Reusable across all artifact types (Document, Flashcards, Quiz, Timeline, Deck).
 */
export function applySurgicalPatch<T extends ArtifactContent>(
  currentContent: T,
  patch: SurgicalPatch
): T {
  const currentItems = getContentItems(currentContent);
  const targetIndex = currentItems.findIndex((item) => item.id === patch.targetId);

  if (targetIndex === -1) {
    throw new InvarianceViolationError(
      `Target node '${patch.targetId}' not found in artifact content`,
      { targetId: patch.targetId }
    );
  }

  const targetItem = currentItems[targetIndex];
  if (targetItem && patch.expectedPreHash) {
    const preDigest = computeNodeDigest(targetItem);
    if (preDigest !== patch.expectedPreHash) {
      throw new InvarianceViolationError(
        `Target node pre-digest mismatch (expected ${patch.expectedPreHash}, computed ${preDigest})`,
        { targetId: patch.targetId, expectedPreHash: patch.expectedPreHash, preDigest }
      );
    }
  }

  if (patch.expectedSiblingHashes) {
    for (const sib of currentItems) {
      if (sib.id !== patch.targetId) {
        const expected = patch.expectedSiblingHashes[sib.id];
        if (expected) {
          const actual = computeNodeDigest(sib);
          if (actual !== expected) {
            throw new InvarianceViolationError(
              `Expected sibling hash mismatch for '${sib.id}' (expected ${expected}, actual ${actual})`,
              { siblingId: sib.id, expectedHash: expected, actualHash: actual }
            );
          }
        }
      }
    }
  }

  // Clone and replace target item at targetIndex
  const updatedItems = [...currentItems];
  updatedItems[targetIndex] = patch.replacement;

  let updatedContent: T;
  if ("blocks" in currentContent) {
    updatedContent = { ...currentContent, blocks: updatedItems };
  } else if ("cards" in currentContent) {
    updatedContent = { ...currentContent, cards: updatedItems };
  } else if ("questions" in currentContent) {
    updatedContent = { ...currentContent, questions: updatedItems };
  } else if ("events" in currentContent) {
    updatedContent = { ...currentContent, events: updatedItems };
  } else if ("slides" in currentContent) {
    updatedContent = { ...currentContent, slides: updatedItems };
  } else {
    throw new InvarianceViolationError("Unsupported artifact content type");
  }

  // Assert sibling invariance
  verifySiblingInvariance(currentContent, updatedContent, patch.targetId);

  return updatedContent;
}
