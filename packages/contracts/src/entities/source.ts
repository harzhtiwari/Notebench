import { z } from "zod";

export const SourceTypeSchema = z.enum([
  "pdf",
  "docx",
  "txt",
  "md",
  "url",
  "text",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  notebookId: z.string().uuid(),
  title: z.string().min(1),
  type: SourceTypeSchema,
  url: z.string().url().optional(),
  filePath: z.string().optional(),
  mimeType: z.string().optional(),
  byteSize: z.number().int().nonnegative().optional(),
  contentHash: z.string().optional(),
  rawFileHash: z.string().optional(),
  tokenCount: z.number().int().nonnegative().optional(),
  summary: z.string().optional(),
  suggestedQuestions: z.array(z.string()).optional(),
  status: z.enum(["pending", "processing", "ready", "failed"]).default("ready"),
  statusMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Source = z.infer<typeof SourceSchema>;

export const CreateSourceInputSchema = z.object({
  notebookId: z.string().uuid(),
  title: z.string().min(1),
  type: SourceTypeSchema,
  url: z.string().url().optional(),
  content: z.string().optional(),
});
export type CreateSourceInput = z.infer<typeof CreateSourceInputSchema>;

export const SourceSummarySchema = z.object({
  summary: z
    .string()
    .min(20, "Summary must be at least 20 characters")
    .max(600, "Summary must not exceed 600 characters")
    .describe("Exactly two concise sentences summarizing the source"),
  suggestedQuestions: z
    .array(z.string().min(10).max(250))
    .min(3, "Must provide at least 3 suggested questions")
    .max(5, "Must provide at most 5 suggested questions")
    .describe("3 to 5 grounded exploratory questions answerable from the source"),
});
export type SourceSummary = z.infer<typeof SourceSummarySchema>;

