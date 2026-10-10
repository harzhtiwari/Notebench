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
  tokenCount: z.number().int().nonnegative().optional(),
  summary: z.string().optional(),
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
