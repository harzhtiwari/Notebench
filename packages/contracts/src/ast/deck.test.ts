import { describe, it, expect } from "vitest";
import { DeckASTSchema, SlideBlockPatchSchema } from "./deck.js";

describe("Slide Deck AST (DeckAST) & Sibling Invariance", () => {
  it("validates a complete Slide Deck with multiple layouts and blocks", () => {
    const validDeck = {
      schemaVersion: 1,
      id: "deck-001",
      title: "Quarterly Research Synthesis",
      theme: {
        palette: "modern-slate",
        primaryColor: "#0f172a",
        accentColor: "#3b82f6",
        fontFamily: "Inter, sans-serif",
      },
      slides: [
        {
          id: "slide-1",
          layout: "title",
          speakerNotes: "Introduce the executive summary.",
          blocks: [
            {
              id: "b-1",
              type: "title",
              text: "Autonomous Synthesis",
            },
            {
              id: "b-2",
              type: "subtitle",
              text: "Next-Generation Living Documents",
            },
          ],
        },
        {
          id: "slide-2",
          layout: "metrics",
          blocks: [
            {
              id: "b-3",
              type: "stat_metric",
              value: "10x",
              label: "Faster Research Workflows",
              trend: "up" as const,
            },
            {
              id: "b-4",
              type: "bullet_list",
              items: [
                "Zero manual data extraction",
                "Strict bounding box source grounding",
              ],
            },
          ],
        },
      ],
    };

    const result = DeckASTSchema.safeParse(validDeck);
    expect(result.success).toBe(true);
  });

  it("validates SlideBlockPatch with SHA-256 sibling verification hashes", () => {
    const validPatch = {
      slideId: "slide-1",
      blockId: "b-1",
      expectedPreHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      siblingHashes: {
        "b-2": "a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      replacementBlock: {
        id: "b-1",
        type: "title",
        text: "Surgically Patched Title",
      },
    };

    const result = SlideBlockPatchSchema.safeParse(validPatch);
    expect(result.success).toBe(true);
  });

  it("rejects SlideBlockPatch if hash format is invalid (must be 64-character hex)", () => {
    const invalidPatch = {
      slideId: "slide-1",
      blockId: "b-1",
      expectedPreHash: "not-a-valid-sha256-hash",
      siblingHashes: {},
      replacementBlock: {
        id: "b-1",
        type: "title",
        text: "Invalid Hash Test",
      },
    };

    const result = SlideBlockPatchSchema.safeParse(invalidPatch);
    expect(result.success).toBe(false);
  });
});
