import {
  type BoundingBox,
  type BoundingRect,
  type PdfExtractorPort,
  type PdfExtractResult,
  type PdfPage,
  type PdfPreflightResult,
} from "@notebook/contracts";

export interface ParsedPdfDocument {
  pageCount: number;
  isScanned: boolean;
  scannedMessage: string | null;
  totalCharacters: number;
  totalWords: number;
  totalBlocks: number;
  totalTables: number;
  metadata: Record<string, string>;
  pages: PdfPage[];
}

/**
 * Clamps a number within [min, max].
 */
function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Normalizes raw points coordinates [x0, y0, x1, y1] into relative [0, 1] page space.
 */
export function normalizeBoundingBox(
  box: readonly [number, number, number, number],
  pageWidth: number,
  pageHeight: number
): BoundingBox {
  if (pageWidth <= 0 || pageHeight <= 0) {
    return [0, 0, 0, 0];
  }
  const x0 = clamp(box[0] / pageWidth);
  const y0 = clamp(box[1] / pageHeight);
  const x1 = clamp(box[2] / pageWidth);
  const y1 = clamp(box[3] / pageHeight);

  return [
    Math.round(x0 * 100000) / 100000,
    Math.round(y0 * 100000) / 100000,
    Math.round(Math.max(x0, x1) * 100000) / 100000,
    Math.round(Math.max(y0, y1) * 100000) / 100000,
  ];
}

/**
 * Converts a [x0, y0, x1, y1] bounding box into [x, y, w, h] geometry.
 */
export function boundingBoxToRect(box: BoundingBox): BoundingRect {
  const x0 = box[0];
  const y0 = box[1];
  const x1 = box[2];
  const y1 = box[3];
  const w = Math.round(Math.max(0, x1 - x0) * 100000) / 100000;
  const h = Math.round(Math.max(0, y1 - y0) * 100000) / 100000;
  return [x0, y0, w, h];
}

/**
 * Converts a [x, y, w, h] rect into [x0, y0, x1, y1] bounding box.
 */
export function rectToBoundingBox(rect: BoundingRect): BoundingBox {
  const x = rect[0];
  const y = rect[1];
  const w = rect[2];
  const h = rect[3];
  const x1 = Math.round((x + w) * 100000) / 100000;
  const y1 = Math.round((y + h) * 100000) / 100000;
  return [x, y, x1, y1];
}


/**
 * Domain service orchestrating PDF preflight, layout extraction, and coordinate normalization.
 */
export class PdfParserService {
  constructor(private readonly extractor: PdfExtractorPort) {}

  /**
   * Fast preflight scan check (<5ms).
   */
  public async preflight(filePath: string): Promise<PdfPreflightResult> {
    return this.extractor.preflightPdf(filePath);
  }

  /**
   * Parses a PDF document. Returns structured layout if text-readable,
   * or a flagged scanned document with zero ghost blocks if image-only.
   */
  public async parse(
    filePath: string,
    options?: { maxPages?: number | undefined }
  ): Promise<ParsedPdfDocument> {
    const preflight = await this.extractor.preflightPdf(filePath);

    // If document is scanned / image-only, bypass expensive layout extraction
    if (preflight.isScanned) {
      return {
        pageCount: preflight.pageCount,
        isScanned: true,
        scannedMessage: preflight.scannedMessage,
        totalCharacters: preflight.totalCharacters,
        totalWords: 0,
        totalBlocks: 0,
        totalTables: 0,
        metadata: {},
        pages: [],
      };
    }

    const extractResult: PdfExtractResult = await this.extractor.extractPdf(
      filePath,
      options
    );

    let totalWords = 0;
    let totalBlocks = 0;
    let totalTables = 0;

    for (const page of extractResult.pages) {
      totalWords += page.words.length;
      totalBlocks += page.blocks.length;
      totalTables += page.tables.length;
    }

    return {
      pageCount: extractResult.pageCount,
      isScanned: extractResult.isScanned,
      scannedMessage: extractResult.scannedMessage,
      totalCharacters: extractResult.totalCharacters,
      totalWords,
      totalBlocks,
      totalTables,
      metadata: extractResult.metadata,
      pages: extractResult.pages,
    };
  }
}
