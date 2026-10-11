import { describe, it, expect } from "vitest";
import {
  HeadingBlockSchema,
  ParagraphBlockSchema,
  ListBlockSchema,
  MathBlockSchema,
  QABlockSchema,
  BlockSchema,
  DocumentContentSchema,
  FlashcardItemSchema,
  FlashcardsContentSchema,
  QuizOptionSchema,
  QuizQuestionSchema,
  QuizContentSchema,
  TimelineEventSchema,
  TimelineContentSchema,
  DeckSlideSchema,
  DeckContentSchema,
  CitationRefSchema,
} from "../index.js";

const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";
const VALID_UUID_3 = "33333333-3333-4333-8333-333333333333";
const VALID_UUID_4 = "44444444-4444-4444-8444-444444444444";
const INVALID_UUID = "non-uuid-string-123";

describe("Artifact AST Schemas & Invariants (Contracts Suite)", () => {
  describe("Requirement 4.1 & C.3.1: Immutable UUIDv4 enforcement", () => {
    it("fails when block id is missing", () => {
      expect(() =>
        HeadingBlockSchema.parse({
          kind: "heading",
          level: 1,
          text: "Intro",
        })
      ).toThrow();
    });

    it("fails when block id is not a valid UUIDv4", () => {
      expect(() =>
        HeadingBlockSchema.parse({
          id: INVALID_UUID,
          kind: "heading",
          level: 1,
          text: "Intro",
        })
      ).toThrow();

      expect(() =>
        ParagraphBlockSchema.parse({
          id: "plain-string-id",
          kind: "paragraph",
          text: "Some text",
        })
      ).toThrow();

      expect(() =>
        MathBlockSchema.parse({
          id: "invalid-uuid",
          kind: "math",
          expression: "E=mc^2",
        })
      ).toThrow();

      expect(() =>
        QABlockSchema.parse({
          id: "invalid-uuid",
          kind: "qa",
          question: "What?",
          answer: "That",
        })
      ).toThrow();

      expect(
        BlockSchema.parse({
          id: VALID_UUID_1,
          kind: "paragraph",
          text: "Valid block",
        })
      ).toBeDefined();
    });

    it("fails when list block sub-items lack valid UUIDv4 id", () => {
      expect(() =>
        ListBlockSchema.parse({
          id: VALID_UUID_1,
          kind: "list",
          ordered: false,
          items: [
            {
              id: "non-uuid-item",
              text: "item 1",
            },
          ],
        })
      ).toThrow();
    });

    it("fails when flashcard item id is non-UUIDv4", () => {
      expect(() =>
        FlashcardItemSchema.parse({
          id: "card-1",
          front: "Q",
          back: "A",
        })
      ).toThrow();
    });

    it("fails when quiz question or option id is non-UUIDv4", () => {
      expect(() =>
        QuizQuestionSchema.parse({
          id: "q-1",
          prompt: "What is 2+2?",
          options: [
            { id: VALID_UUID_1, text: "4" },
            { id: VALID_UUID_2, text: "5" },
          ],
          correctOptionId: VALID_UUID_1,
          explanation: "Math",
        })
      ).toThrow();

      expect(() =>
        QuizOptionSchema.parse({
          id: "opt-1",
          text: "Option",
        })
      ).toThrow();
    });

    it("fails when quiz correctOptionId does not match any option id", () => {
      expect(() =>
        QuizQuestionSchema.parse({
          id: VALID_UUID_1,
          prompt: "What is 2+2?",
          options: [
            { id: VALID_UUID_2, text: "4" },
            { id: VALID_UUID_3, text: "5" },
          ],
          correctOptionId: VALID_UUID_4, // Does not exist in options
          explanation: "Math",
        })
      ).toThrow();
    });

    it("fails when timeline event id is non-UUIDv4", () => {
      expect(() =>
        TimelineEventSchema.parse({
          id: "event-1",
          date: "2026-01-01",
          title: "Launch",
          description: "Notebench launch",
        })
      ).toThrow();
    });

    it("fails when deck slide id is non-UUIDv4", () => {
      expect(() =>
        DeckSlideSchema.parse({
          id: "slide-1",
          layout: "title",
          blocks: [],
        })
      ).toThrow();
    });

    it("passes with valid UUIDv4 across all block and item types", () => {
      const heading = HeadingBlockSchema.parse({
        id: VALID_UUID_1,
        kind: "heading",
        level: 2,
        text: "Section 2",
      });
      expect(heading.id).toBe(VALID_UUID_1);

      const flashcard = FlashcardItemSchema.parse({
        id: VALID_UUID_1,
        front: "Front",
        back: "Back",
      });
      expect(flashcard.id).toBe(VALID_UUID_1);

      const quiz = QuizQuestionSchema.parse({
        id: VALID_UUID_1,
        prompt: "Prompt?",
        options: [
          { id: VALID_UUID_2, text: "Opt 1" },
          { id: VALID_UUID_3, text: "Opt 2" },
        ],
        correctOptionId: VALID_UUID_2,
        explanation: "Because",
      });
      expect(quiz.id).toBe(VALID_UUID_1);

      const timeline = TimelineEventSchema.parse({
        id: VALID_UUID_1,
        date: "2026-10-11",
        title: "Milestone",
        description: "Milestone reached",
      });
      expect(timeline.id).toBe(VALID_UUID_1);

      const slide = DeckSlideSchema.parse({
        id: VALID_UUID_1,
        layout: "title",
        blocks: [heading],
      });
      expect(slide.id).toBe(VALID_UUID_1);
    });
  });

  describe("Requirement 4.2: schemaVersion: 1 enforcement", () => {
    it("defaults schemaVersion to 1 when omitted", () => {
      const doc = DocumentContentSchema.parse({
        blocks: [
          {
            id: VALID_UUID_1,
            kind: "heading",
            level: 1,
            text: "Title",
          },
        ],
      });
      expect(doc.schemaVersion).toBe(1);

      const fc = FlashcardsContentSchema.parse({
        cards: [
          {
            id: VALID_UUID_1,
            front: "F",
            back: "B",
          },
        ],
      });
      expect(fc.schemaVersion).toBe(1);

      const quiz = QuizContentSchema.parse({
        questions: [
          {
            id: VALID_UUID_1,
            prompt: "P",
            options: [
              { id: VALID_UUID_2, text: "1" },
              { id: VALID_UUID_3, text: "2" },
            ],
            correctOptionId: VALID_UUID_2,
            explanation: "E",
          },
        ],
      });
      expect(quiz.schemaVersion).toBe(1);

      const tl = TimelineContentSchema.parse({
        events: [
          {
            id: VALID_UUID_1,
            date: "2026-10-11",
            title: "Event",
            description: "Desc",
          },
        ],
      });
      expect(tl.schemaVersion).toBe(1);

      const deck = DeckContentSchema.parse({
        theme: {
          id: VALID_UUID_1,
          palette: ["#fff", "#000"],
          fonts: { heading: "sans-serif", body: "serif" },
        },
        slides: [],
      });
      expect(deck.schemaVersion).toBe(1);
    });

    it("rejects unsupported schemaVersion > 1", () => {
      expect(() =>
        DocumentContentSchema.parse({
          schemaVersion: 2,
          blocks: [],
        })
      ).toThrow();
    });
  });

  describe("Requirement C.3.1: CitationRef normalized bounding box", () => {
    it("accepts valid normalized bounding box [0, 1]", () => {
      const ref = CitationRefSchema.parse({
        sourceId: VALID_UUID_1,
        chunkId: VALID_UUID_2,
        locator: {
          page: 1,
          box: [0.0, 0.1, 0.9, 1.0],
        },
      });
      expect(ref.locator.box).toEqual([0.0, 0.1, 0.9, 1.0]);
    });

    it("rejects out of bounds bounding box", () => {
      expect(() =>
        CitationRefSchema.parse({
          sourceId: VALID_UUID_1,
          chunkId: VALID_UUID_2,
          locator: {
            box: [-0.1, 0.0, 1.0, 1.0],
          },
        })
      ).toThrow();

      expect(() =>
        CitationRefSchema.parse({
          sourceId: VALID_UUID_1,
          chunkId: VALID_UUID_2,
          locator: {
            box: [0.0, 0.0, 1.5, 1.0],
          },
        })
      ).toThrow();
    });
  });
});
