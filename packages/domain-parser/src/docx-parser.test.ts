import { describe, expect, it, vi } from "vitest";
import type { DocxExtractorPort, DocxExtractResult } from "@notebook/contracts";
import { DocxParserService } from "./docx-parser.js";

describe("DocxParserService (Seam 1)", () => {
  const mockResult: DocxExtractResult = {
    totalCharacters: 120,
    totalWords: 20,
    totalParagraphs: 3,
    totalTables: 1,
    metadata: {
      title: "Architecture Specification",
      author: "Senior Architect",
    },
    blocks: [
      {
        index: 0,
        nodeType: "heading",
        level: 1,
        text: "1. Overview",
        charStart: 0,
        charEnd: 11,
        headingHierarchy: ["1. Overview"],
      },
      {
        index: 1,
        nodeType: "paragraph",
        text: "This document describes the Notebench architecture.",
        charStart: 13,
        charEnd: 64,
        headingHierarchy: ["1. Overview"],
      },
      {
        index: 2,
        nodeType: "table",
        text: "Module | Status\nParser | Complete",
        charStart: 64,
        charEnd: 96,
        headingHierarchy: ["1. Overview"],
        table: {
          headers: ["Module", "Status"],
          rows: [["Parser", "Complete"]],
        },
      },
    ],
  };

  const mockExtractor: DocxExtractorPort = {
    extractDocx: vi.fn().mockResolvedValue(mockResult),
  };

  it("extracts semantic hierarchy with character offsets and heading hierarchy", async () => {
    const service = new DocxParserService(mockExtractor);
    const parsed = await service.parse("test.docx");

    expect(mockExtractor.extractDocx).toHaveBeenCalledWith("test.docx");
    expect(parsed.totalCharacters).toBe(120);
    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.blocks[0]?.nodeType).toBe("heading");
    expect(parsed.blocks[0]?.level).toBe(1);
    expect(parsed.blocks[0]?.charStart).toBe(0);
    expect(parsed.blocks[0]?.charEnd).toBe(11);
    expect(parsed.blocks[1]?.charStart).toBe(13);
    expect(parsed.blocks[2]?.nodeType).toBe("table");
    expect(parsed.blocks[2]?.table?.headers).toEqual(["Module", "Status"]);
  });

  it("calculates plain text representation from blocks", async () => {
    const service = new DocxParserService(mockExtractor);
    const parsed = await service.parse("test.docx");

    expect(parsed.plainText).toContain("1. Overview");
    expect(parsed.plainText).toContain("This document describes the Notebench architecture.");
  });

  it("rejects when extractor throws", async () => {
    const failingExtractor: DocxExtractorPort = {
      extractDocx: vi.fn().mockRejectedValue(new Error("File corrupt")),
    };
    const service = new DocxParserService(failingExtractor);

    await expect(service.parse("corrupt.docx")).rejects.toThrow("File corrupt");
  });
});
