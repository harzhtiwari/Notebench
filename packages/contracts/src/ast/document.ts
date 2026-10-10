import { z } from "zod";
import { BoundingBoxSchema } from "../streaming/sse.js";

export const MarkSchema = z.object({
  type: z.enum(["bold", "italic", "strike", "code", "link"]),
  attrs: z.record(z.string(), z.unknown()).optional(),
});
export type Mark = z.infer<typeof MarkSchema>;

export const CitationAttrsSchema = z.object({
  citationId: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  pageNumber: z.number().int().positive(),
  boundingBox: BoundingBoxSchema,
  snippet: z.string(),
});
export type CitationAttrs = z.infer<typeof CitationAttrsSchema>;

export const CitationNodeSchema = z.object({
  type: z.literal("citation"),
  attrs: CitationAttrsSchema,
});
export type CitationNode = z.infer<typeof CitationNodeSchema>;

export const TextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
});
export type TextNode = z.infer<typeof TextNodeSchema>;

export type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  content?: ProseMirrorNode[] | undefined;
  text?: string | undefined;
  marks?: Mark[] | undefined;
};

export const ProseMirrorNodeSchema: z.ZodType<ProseMirrorNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(ProseMirrorNodeSchema).optional(),
    text: z.string().optional(),
    marks: z.array(MarkSchema).optional(),
  })
);

export const DocumentASTSchema = z.object({
  type: z.literal("doc"),
  content: z.array(ProseMirrorNodeSchema),
});
export type DocumentAST = z.infer<typeof DocumentASTSchema>;
