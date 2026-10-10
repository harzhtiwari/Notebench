import { describe, it, expect, vi } from "vitest";
import type {
  PdfExtractorPort,
  PdfExtractResult,
  PdfPreflightResult,
} from "@notebook/contracts";
import {
  PdfParserService,
  normalizeBoundingBox,
  boundingBoxToRect,
  rectToBoundingBox,
} from "./pdf-parser.js";

describe("PdfParserService & Coordinate Geometry (Domain Parser)", () => {
  it("normalizes bounding boxes into [0, 1] interval", () => {
    // 612 x 792 page
    const norm = normalizeBoundingBox([61.2, 79.2, 306, 396], 612, 792);
    expect(norm[0]).toBeCloseTo(0.1, 4);
    expect(norm[1]).toBeCloseTo(0.1, 4);
    expect(norm[2]).toBeCloseTo(0.5, 4);
    expect(norm[3]).toBeCloseTo(0.5, 4);
  });

  it("converts between bounding box [x0, y0, x1, y1] and rect [x, y, w, h]", () => {
    const box: [number, number, number, number] = [0.1, 0.2, 0.4, 0.6];
    const rect = boundingBoxToRect(box);
    expect(rect).toEqual([0.1, 0.2, 0.3, 0.4]);

    const roundtrip = rectToBoundingBox(rect);
    expect(roundtrip[0]).toBeCloseTo(box[0], 5);
    expect(roundtrip[1]).toBeCloseTo(box[1], 5);
    expect(roundtrip[2]).toBeCloseTo(box[2], 5);
    expect(roundtrip[3]).toBeCloseTo(box[3], 5);
  });

  it("handles preflight scanned detection", async () => {
    const mockExtractor: PdfExtractorPort = {
      preflightPdf: vi.fn().mockResolvedValue({
        isScanned: true,
        scannedMessage: "Scanned PDF. OCR arrives in 0.2",
        pageCount: 3,
        totalCharacters: 0,
      } satisfies PdfPreflightResult),
      extractPdf: vi.fn(),
    };

    const service = new PdfParserService(mockExtractor);
    const preflight = await service.preflight("/path/to/scanned.pdf");

    expect(preflight.isScanned).toBe(true);
    expect(preflight.scannedMessage).toBe("Scanned PDF. OCR arrives in 0.2");
    expect(mockExtractor.preflightPdf).toHaveBeenCalledWith("/path/to/scanned.pdf");
  });

  it("parses valid PDF and aggregates blocks, words, and tables", async () => {
    const mockExtractResult: PdfExtractResult = {
      pageCount: 1,
      isScanned: false,
      scannedMessage: null,
      totalCharacters: 120,
      metadata: { title: "Research Paper" },
      pages: [
        {
          pageNumber: 1,
          width: 612,
          height: 792,
          text: "Notebench living media architecture",
          words: [
            {
              text: "Notebench",
              box: [0.1, 0.1, 0.2, 0.15],
              rect: [0.1, 0.1, 0.1, 0.05],
            },
          ],
          blocks: [
            {
              pageNumber: 1,
              text: "Notebench living media architecture",
              box: [0.1, 0.1, 0.5, 0.15],
              rect: [0.1, 0.1, 0.4, 0.05],
              words: [
                {
                  text: "Notebench",
                  box: [0.1, 0.1, 0.2, 0.15],
                  rect: [0.1, 0.1, 0.1, 0.05],
                },
              ],
            },
          ],
          tables: [
            {
              box: [0.1, 0.3, 0.9, 0.6],
              rect: [0.1, 0.3, 0.8, 0.3],
              cells: [],
              rows: [
                ["Col 1", "Col 2"],
                ["Val 1", "Val 2"],
              ],
            },
          ],
        },
      ],
    };

    const mockExtractor: PdfExtractorPort = {
      preflightPdf: vi.fn().mockResolvedValue({
        isScanned: false,
        scannedMessage: null,
        pageCount: 1,
        totalCharacters: 120,
      }),
      extractPdf: vi.fn().mockResolvedValue(mockExtractResult),
    };

    const service = new PdfParserService(mockExtractor);
    const parsed = await service.parse("/path/to/doc.pdf");

    expect(parsed.pageCount).toBe(1);
    expect(parsed.isScanned).toBe(false);
    expect(parsed.totalWords).toBe(1);
    expect(parsed.totalBlocks).toBe(1);
    expect(parsed.totalTables).toBe(1);
    expect(parsed.pages[0]?.tables[0]?.rows).toHaveLength(2);
  });

  it("handles scanned PDF by returning scanned document without ghost embeddings", async () => {
    const mockExtractor: PdfExtractorPort = {
      preflightPdf: vi.fn().mockResolvedValue({
        isScanned: true,
        scannedMessage: "Scanned PDF. OCR arrives in 0.2",
        pageCount: 2,
        totalCharacters: 10,
      }),
      extractPdf: vi.fn(),
    };

    const service = new PdfParserService(mockExtractor);
    const parsed = await service.parse("/path/to/scanned.pdf");

    expect(parsed.isScanned).toBe(true);
    expect(parsed.scannedMessage).toBe("Scanned PDF. OCR arrives in 0.2");
    expect(parsed.totalBlocks).toBe(0);
    expect(mockExtractor.extractPdf).not.toHaveBeenCalled();
  });
});
