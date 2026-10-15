import { z } from "zod";
import { BlockSchema } from "../entities/block.js";
import { CitationRefSchema } from "../entities/citation.js";

/**
 * Document Content AST: Report, Study Guide, FAQ (Decision 4.1, C.3.2)
 */
export const DocumentContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  blocks: z.array(BlockSchema),
});
export type DocumentContent = z.infer<typeof DocumentContentSchema>;

/**
 * Flashcard Item Node (Decision 4.1, C.3.2)
 */
export const FlashcardItemSchema = z.object({
  id: z.uuidv4(),
  front: z.string(),
  back: z.string(),
  citations: z.array(CitationRefSchema).default([]),
  locked: z.boolean().optional(),
});
export type FlashcardItem = z.infer<typeof FlashcardItemSchema>;

/**
 * Flashcards Content AST (Decision 4.1, C.3.2)
 */
export const FlashcardsContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  cards: z.array(FlashcardItemSchema),
});
export type FlashcardsContent = z.infer<typeof FlashcardsContentSchema>;

/**
 * Quiz Question Option Node (Decision 4.1, 4.9, C.3.2)
 */
export const QuizOptionSchema = z.object({
  id: z.uuidv4(),
  text: z.string(),
});
export type QuizOption = z.infer<typeof QuizOptionSchema>;

/**
 * Quiz Question Node (Decision 4.1, 4.9, C.3.2)
 * Enforces relational integrity: correctOptionId must match one of the option IDs.
 */
export const QuizQuestionSchema = z
  .object({
    id: z.uuidv4(),
    prompt: z.string(),
    options: z.array(QuizOptionSchema).min(2).max(6),
    correctOptionId: z.uuidv4(),
    explanation: z.string(),
    citations: z.array(CitationRefSchema).default([]),
    locked: z.boolean().optional(),
  })
  .refine((q) => q.options.some((opt) => opt.id === q.correctOptionId), {
    message: "correctOptionId must match one of the option IDs in options array",
    path: ["correctOptionId"],
  });
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

/**
 * Quiz Content AST (Decision 4.1, C.3.2)
 */
export const QuizContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  questions: z.array(QuizQuestionSchema),
});
export type QuizContent = z.infer<typeof QuizContentSchema>;

/**
 * Timeline Event Node (P1) (Decision 4.1, C.3.2)
 */
export const TimelineEventSchema = z.object({
  id: z.uuidv4(),
  date: z.string(),
  title: z.string(),
  description: z.string(),
  citations: z.array(CitationRefSchema).default([]),
  locked: z.boolean().optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

/**
 * Timeline Content AST (P1) (Decision 4.1, C.3.2)
 */
export const TimelineContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  events: z.array(TimelineEventSchema),
});
export type TimelineContent = z.infer<typeof TimelineContentSchema>;

/**
 * Slide Deck Theme (Stretch P2 Gated at M5) (C.3.2)
 */
export const DeckContentThemeSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  palette: z.array(z.string()),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
  }),
});
export type DeckContentTheme = z.infer<typeof DeckContentThemeSchema>;

/**
 * Slide Deck Slide Node (Stretch P2 Gated at M5) (C.3.2)
 */
export const DeckSlideSchema = z.object({
  id: z.uuidv4(),
  layout: z.enum(["title", "bullets", "two_column", "image_text"]),
  blocks: z.array(BlockSchema),
  notes: z.string().optional(),
  locked: z.boolean().optional(),
});
export type DeckSlide = z.infer<typeof DeckSlideSchema>;

/**
 * Slide Deck Content AST (Stretch P2 Gated at M5) (C.3.2)
 */
export const DeckContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  theme: DeckContentThemeSchema,
  slides: z.array(DeckSlideSchema),
});
export type DeckContent = z.infer<typeof DeckContentSchema>;

/**
 * Canonical discriminated union for all living artifact content types (Decision 4.1, C.3.2).
 */
export const ArtifactContentSchema = z.union([
  DocumentContentSchema,
  FlashcardsContentSchema,
  QuizContentSchema,
  TimelineContentSchema,
  DeckContentSchema,
]);
export type ArtifactContent =
  | DocumentContent
  | FlashcardsContent
  | QuizContent
  | TimelineContent
  | DeckContent;
