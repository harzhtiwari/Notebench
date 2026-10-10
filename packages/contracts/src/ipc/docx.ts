import { z } from "zod";

export const DocxNodeTypeSchema = z.enum(["heading", "paragraph", "list-item", "table"]);
export type DocxNodeType = z.infer<typeof DocxNodeTypeSchema>;

/**
 * Extracted DOCX semantic structural block.
 */
export const DocxBlockSchema = z.object({
  index: z.number().int().nonnegative(),
  nodeType: DocxNodeTypeSchema,
  level: z.number().int().min(1).max(6).optional(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  headingHierarchy: z.array(z.string()).default([]),
  table: z
    .object({
      rows: z.array(z.array(z.string())),
      headers: z.array(z.string()).optional(),
    })
    .optional(),
});
export type DocxBlock = z.infer<typeof DocxBlockSchema>;

/**
 * Result of extracting a DOCX document via python-docx.
 */
export const DocxExtractResultSchema = z.object({
  totalCharacters: z.number().int().nonnegative(),
  totalWords: z.number().int().nonnegative(),
  totalParagraphs: z.number().int().nonnegative(),
  totalTables: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.string()).default({}),
  blocks: z.array(DocxBlockSchema),
});
export type DocxExtractResult = z.infer<typeof DocxExtractResultSchema>;

/**
 * Port interface for querying DOCX extraction capabilities.
 */
export interface DocxExtractorPort {
  extractDocx(filePath: string): Promise<DocxExtractResult>;
}
