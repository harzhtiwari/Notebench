import { describe, it, expect } from "vitest";
import { DocumentASTSchema } from "./document.js";

describe("ProseMirror / Tiptap Document AST (DocumentAST)", () => {
  it("validates a structured document with headings, paragraphs, and inline citations", () => {
    const validDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            {
              type: "text",
              text: "Research Brief: Financial Highlights",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The quarterly revenue grew significantly across all major markets.",
            },
            {
              type: "citation",
              attrs: {
                citationId: "cite-001",
                fileId: "file-123",
                fileName: "report_q3.pdf",
                pageNumber: 4,
                boundingBox: [0.1, 0.25, 0.9, 0.45] as [number, number, number, number],
                snippet: "Operating margin increased to 34%.",
              },
            },
          ],
        },
        {
          type: "callout",
          attrs: { variant: "info" as const },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Key takeaway: North America and EMEA segments outperformed estimates.",
                },
              ],
            },
          ],
        },
      ],
    };

    const result = DocumentASTSchema.safeParse(validDoc);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid root node that is not type doc", () => {
    const invalidDoc = {
      type: "not-a-doc",
      content: [],
    };

    const result = DocumentASTSchema.safeParse(invalidDoc);
    expect(result.success).toBe(false);
  });
});
