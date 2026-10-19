import { describe, expect, it } from "vitest";
import {
  PdfBlockSchema,
  PdfExtractResultSchema,
  PdfPageSchema,
  PdfPreflightResultSchema,
  PdfTableSchema,
  PdfWordSchema,
} from "./pdf.js";

describe("PDF Extraction IPC Contracts & Schemas", () => {
  it("validates word and block schemas with normalized bounding boxes [0, 1]", () => {
    const word = PdfWordSchema.parse({
      text: "Notebench",
      box: [0.1, 0.2, 0.3, 0.4],
      rect: [0.1, 0.2, 0.2, 0.2],
    });
    expect(word.text).toBe("Notebench");
    expect(word.box).toEqual([0.1, 0.2, 0.3, 0.4]);

    const block = PdfBlockSchema.parse({
      pageNumber: 1,
      text: "Notebench living media",
      box: [0.1, 0.2, 0.5, 0.4],
      rect: [0.1, 0.2, 0.4, 0.2],
      words: [word],
    });
    expect(block.pageNumber).toBe(1);
    expect(block.words).toHaveLength(1);
  });

  it("rejects invalid out-of-bound bounding box coordinates", () => {
    expect(() =>
      PdfWordSchema.parse({
        text: "Invalid",
        box: [-0.1, 0.2, 1.2, 0.4],
        rect: [0, 0, 1, 1],
      })
    ).toThrow();
  });

  it("validates table schemas with cell matrix and normalized bbox", () => {
    const table = PdfTableSchema.parse({
      box: [0.05, 0.1, 0.95, 0.5],
      rect: [0.05, 0.1, 0.9, 0.4],

      rows: [
        ["Quarter", "Revenue"],
        ["Q1", "$100M"],
      ],
    });
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[0]).toBe("Quarter");
  });

  it("validates preflight result schema for scanned and valid PDFs", () => {
    const scanned = PdfPreflightResultSchema.parse({
      isScanned: true,
      scannedMessage: "Scanned PDF. OCR arrives in 0.2",
      pageCount: 5,
      totalCharacters: 12,
    });
    expect(scanned.isScanned).toBe(true);
    expect(scanned.scannedMessage).toBe("Scanned PDF. OCR arrives in 0.2");

    const valid = PdfPreflightResultSchema.parse({
      isScanned: false,
      scannedMessage: null,
      pageCount: 10,
      totalCharacters: 4500,
    });
    expect(valid.isScanned).toBe(false);
    expect(valid.scannedMessage).toBeNull();
  });

  it("validates full extraction result schema", () => {
    const page = PdfPageSchema.parse({
      pageNumber: 1,
      width: 612,
      height: 792,
      text: "Sample page text",
      words: [],
      blocks: [],
      tables: [],
    });

    const result = PdfExtractResultSchema.parse({
      pageCount: 1,
      isScanned: false,
      scannedMessage: null,
      totalCharacters: 16,
      metadata: { title: "Research Paper" },
      pages: [page],
    });
    expect(result.pageCount).toBe(1);
    expect(result.pages[0]?.width).toBe(612);
  });
});
