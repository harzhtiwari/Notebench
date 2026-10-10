import { z } from "zod";
import { BoundingBoxSchema } from "../streaming/sse.js";

/**
 * Normalized 4-tuple [x, y, w, h] in relative [0, 1] page coordinates.
 */
export const BoundingRectSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export type BoundingRect = z.infer<typeof BoundingRectSchema>;

/**
 * Extracted word with exact coordinates in both [x0, y0, x1, y1] and [x, y, w, h] geometries.
 */
export const PdfWordSchema = z.object({
  text: z.string(),
  box: BoundingBoxSchema,
  rect: BoundingRectSchema,
});
export type PdfWord = z.infer<typeof PdfWordSchema>;

/**
 * Extracted text block / paragraph grouped by line and vertical proximity.
 */
export const PdfBlockSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
  box: BoundingBoxSchema,
  rect: BoundingRectSchema,
  words: z.array(PdfWordSchema),
});
export type PdfBlock = z.infer<typeof PdfBlockSchema>;

/**
 * Extracted tabular cell geometry.
 */
export const PdfTableCellSchema = z.object({
  box: BoundingBoxSchema,
  rect: BoundingRectSchema,
});
export type PdfTableCell = z.infer<typeof PdfTableCellSchema>;

/**
 * Extracted tabular structure with bounding geometry, cells, and string matrix rows.
 */
export const PdfTableSchema = z.object({
  box: BoundingBoxSchema,
  rect: BoundingRectSchema,
  cells: z.array(PdfTableCellSchema).default([]),
  rows: z.array(z.array(z.string())),
});
export type PdfTable = z.infer<typeof PdfTableSchema>;


/**
 * Extracted single PDF page layout representation.
 */
export const PdfPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  text: z.string(),
  words: z.array(PdfWordSchema),
  blocks: z.array(PdfBlockSchema),
  tables: z.array(PdfTableSchema),
});
export type PdfPage = z.infer<typeof PdfPageSchema>;

/**
 * Fast preflight scan check result (<5ms) from pypdf.
 */
export const PdfPreflightResultSchema = z.object({
  isScanned: z.boolean(),
  scannedMessage: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  totalCharacters: z.number().int().nonnegative(),
});
export type PdfPreflightResult = z.infer<typeof PdfPreflightResultSchema>;

/**
 * Complete document extraction payload from pdfplumber + pypdf.
 */
export const PdfExtractResultSchema = z.object({
  pageCount: z.number().int().nonnegative(),
  isScanned: z.boolean(),
  scannedMessage: z.string().nullable(),
  totalCharacters: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.string()),
  pages: z.array(PdfPageSchema),
});
export type PdfExtractResult = z.infer<typeof PdfExtractResultSchema>;

/**
 * Port contract for querying Python doc-worker PDF extraction capabilities.
 */
export interface PdfExtractorPort {
  preflightPdf(filePath: string): Promise<PdfPreflightResult>;
  extractPdf(
    filePath: string,
    options?: { maxPages?: number | undefined }
  ): Promise<PdfExtractResult>;
}
