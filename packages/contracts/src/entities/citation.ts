import { z } from "zod";
import { BoundingBoxSchema } from "../streaming/sse.js";

export const CitationLocatorSchema = z.object({
  page: z.number().int().positive().optional(),
  box: BoundingBoxSchema.optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
});
export type CitationLocator = z.infer<typeof CitationLocatorSchema>;

export const CitationRefSchema = z.object({
  sourceId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  snippet: z.string().optional(),
  locator: CitationLocatorSchema.default({}),
});
export type CitationRef = z.infer<typeof CitationRefSchema>;

export const CitationSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  sourceId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  snippet: z.string().optional(),
  locator: CitationLocatorSchema.default({}),
  citationIndex: z.number().int().positive().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;
