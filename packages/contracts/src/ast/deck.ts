import { z } from "zod";

export const SlideLayoutSchema = z.enum([
  "title",
  "content",
  "split",
  "quote",
  "metrics",
  "timeline",
]);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

const Sha256HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const TitleBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("title"),
  text: z.string(),
});
export type TitleBlock = z.infer<typeof TitleBlockSchema>;

export const SubtitleBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("subtitle"),
  text: z.string(),
});
export type SubtitleBlock = z.infer<typeof SubtitleBlockSchema>;

export const BulletListBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("bullet_list"),
  items: z.array(z.string()),
});
export type BulletListBlock = z.infer<typeof BulletListBlockSchema>;

export const CalloutBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("callout"),
  text: z.string(),
  variant: z.enum(["info", "warning", "success"]).default("info"),
});
export type CalloutBlock = z.infer<typeof CalloutBlockSchema>;

export const StatMetricBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("stat_metric"),
  value: z.string(),
  label: z.string(),
  trend: z.enum(["up", "down", "neutral"]).optional(),
});
export type StatMetricBlock = z.infer<typeof StatMetricBlockSchema>;

export const CodeSnippetBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("code_snippet"),
  code: z.string(),
  language: z.string().default("typescript"),
});
export type CodeSnippetBlock = z.infer<typeof CodeSnippetBlockSchema>;

export const MediaPlaceholderBlockSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  type: z.literal("media_placeholder"),
  mediaType: z.enum(["image", "chart", "diagram"]),
  caption: z.string().optional(),
});
export type MediaPlaceholderBlock = z.infer<typeof MediaPlaceholderBlockSchema>;

export const SlideBlockSchema = z.discriminatedUnion("type", [
  TitleBlockSchema,
  SubtitleBlockSchema,
  BulletListBlockSchema,
  CalloutBlockSchema,
  StatMetricBlockSchema,
  CodeSnippetBlockSchema,
  MediaPlaceholderBlockSchema,
]);
export type SlideBlock = z.infer<typeof SlideBlockSchema>;

export const SlideSchema = z.object({
  id: z.string().min(1),
  layout: SlideLayoutSchema,
  speakerNotes: z.string().optional(),
  blocks: z.array(SlideBlockSchema),
});
export type Slide = z.infer<typeof SlideSchema>;

export const DeckThemeSchema = z.object({
  palette: z.string(),
  primaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
});
export type DeckTheme = z.infer<typeof DeckThemeSchema>;

export const DeckASTSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  theme: DeckThemeSchema,
  slides: z.array(SlideSchema),
});
export type DeckAST = z.infer<typeof DeckASTSchema>;

/**
 * Surgical block patching with sibling invariance SHA-256 verification.
 */
export const SlideBlockPatchSchema = z.object({
  slideId: z.string().min(1),
  blockId: z.string().min(1),
  expectedPreHash: Sha256HashSchema,
  siblingHashes: z.record(z.string(), Sha256HashSchema),
  replacementBlock: SlideBlockSchema,
});
export type SlideBlockPatch = z.infer<typeof SlideBlockPatchSchema>;
