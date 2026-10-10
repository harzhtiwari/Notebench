import { z } from "zod";
import { CitationRefSchema } from "./citation.js";

export const HeadingBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  kind: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
  locked: z.boolean().optional(),
});
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;

export const ParagraphBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  kind: z.literal("paragraph"),
  text: z.string(),
  citations: z.array(CitationRefSchema).default([]),
  locked: z.boolean().optional(),
});
export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;

export const ListBlockItemSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  text: z.string(),
  citations: z.array(CitationRefSchema).default([]),
});
export type ListBlockItem = z.infer<typeof ListBlockItemSchema>;

export const ListBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  kind: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(ListBlockItemSchema),
  locked: z.boolean().optional(),
});
export type ListBlock = z.infer<typeof ListBlockSchema>;

export const MathBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  kind: z.literal("math"),
  latex: z.string(),
  locked: z.boolean().optional(),
});
export type MathBlock = z.infer<typeof MathBlockSchema>;

export const QABlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  kind: z.literal("qa"),
  question: z.string(),
  answer: z.string(),
  citations: z.array(CitationRefSchema).default([]),
  locked: z.boolean().optional(),
});
export type QABlock = z.infer<typeof QABlockSchema>;

export const BlockSchema = z.discriminatedUnion("kind", [
  HeadingBlockSchema,
  ParagraphBlockSchema,
  ListBlockSchema,
  MathBlockSchema,
  QABlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

export const DocumentBlockSchema = BlockSchema;
export type DocumentBlock = Block;
