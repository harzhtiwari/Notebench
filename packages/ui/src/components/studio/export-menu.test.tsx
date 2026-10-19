// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ExportMenu,
  getExportFormatsForArtifactType,
  type ExportFormatOption,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("ExportMenu (Ticket 18: export menu reuse)", () => {
  describe("filtering by artifact type (Seam 1: type-based formats)", () => {
    it("getExportFormatsForArtifactType includes Anki and CSV for flashcards", () => {
      const formats = getExportFormatsForArtifactType("flashcards");
      const formatKeys = formats.map((f: ExportFormatOption) => f.format);

      expect(formatKeys).toContain("anki");
      expect(formatKeys).toContain("csv");
      expect(formatKeys).toContain("markdown");
      expect(formatKeys).toContain("text");
      expect(formatKeys).toContain("json");
    });

    it("getExportFormatsForArtifactType excludes Anki for report, study_guide, faq, quiz", () => {
      const reportFormats = getExportFormatsForArtifactType("report").map((f) => f.format);
      const studyGuideFormats = getExportFormatsForArtifactType("study_guide").map((f) => f.format);
      const faqFormats = getExportFormatsForArtifactType("faq").map((f) => f.format);
      const quizFormats = getExportFormatsForArtifactType("quiz").map((f) => f.format);
      const defaultFormats = getExportFormatsForArtifactType(undefined).map((f) => f.format);

      expect(reportFormats).not.toContain("anki");
      expect(studyGuideFormats).not.toContain("anki");
      expect(faqFormats).not.toContain("anki");
      expect(quizFormats).not.toContain("anki");
      expect(defaultFormats).not.toContain("anki");

      // Verify base document formats are available
      expect(reportFormats).toEqual(["markdown", "text", "json"]);
      expect(studyGuideFormats).toEqual(["markdown", "text", "json"]);
      expect(faqFormats).toEqual(["markdown", "text", "json"]);
      // Quiz offers CSV in addition to document formats
      expect(quizFormats).toContain("csv");
    });

    it("renders Anki option ONLY when artifactType is flashcards", () => {
      // 1. Render for flashcards: Anki should be present
      const { unmount } = render(
        <ExportMenu open artifactType="flashcards" />
      );

      expect(screen.getByRole("menuitem", { name: /anki/i })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: /markdown/i })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: /csv/i })).toBeDefined();
      unmount();

      // 2. Render for report: Anki MUST NOT be present
      render(
        <ExportMenu open artifactType="report" />
      );

      expect(screen.queryByRole("menuitem", { name: /anki/i })).toBeNull();
      expect(screen.getByRole("menuitem", { name: /markdown/i })).toBeDefined();
    });

    it("renders Markdown, Plain text, and JSON for generic/report artifacts", () => {
      render(
        <ExportMenu open artifactType="report" />
      );

      expect(screen.getByRole("menuitem", { name: /markdown/i })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: /plain text|text/i })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: /json/i })).toBeDefined();
      expect(screen.queryByRole("menuitem", { name: /anki/i })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: /csv/i })).toBeNull();
    });
  });

  describe("UI structure and trigger (Seam 2: DropdownMenu reuse and icons)", () => {
    it("renders default trigger button with Download icon and 'Export' label", () => {
      const { container } = render(
        <ExportMenu artifactType="report" />
      );

      const button = screen.getByRole("button", { name: /export/i });
      expect(button).toBeDefined();
      // Verifies the icon SVG is present inside trigger
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("supports custom buttonLabel on default trigger", () => {
      render(
        <ExportMenu artifactType="report" buttonLabel="Export Artifact" />
      );

      expect(screen.getByRole("button", { name: /export artifact/i })).toBeDefined();
    });

    it("supports custom trigger element", () => {
      render(
        <ExportMenu
          artifactType="flashcards"
          trigger={<button type="button">Custom Trigger</button>}
        />
      );

      expect(screen.getByRole("button", { name: "Custom Trigger" })).toBeDefined();
    });

    it("honors disabled prop on default trigger", () => {
      render(
        <ExportMenu artifactType="report" disabled />
      );

      const button = screen.getByRole("button", { name: /export/i });
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("selection handling (Seam 3: onExport callbacks)", () => {
    it("notifies onExport with format key and option metadata when item clicked", () => {
      const onExport = vi.fn();
      render(
        <ExportMenu open artifactType="flashcards" onExport={onExport} />
      );

      const ankiItem = screen.getByRole("menuitem", { name: /anki/i });
      fireEvent.click(ankiItem);

      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onExport).toHaveBeenCalledWith(
        "anki",
        expect.objectContaining({
          format: "anki",
          extension: ".txt",
        })
      );
    });

    it("notifies onExport for markdown format on standard artifact", () => {
      const onExport = vi.fn();
      render(
        <ExportMenu open artifactType="report" onExport={onExport} />
      );

      const markdownItem = screen.getByRole("menuitem", { name: /markdown/i });
      fireEvent.click(markdownItem);

      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onExport).toHaveBeenCalledWith(
        "markdown",
        expect.objectContaining({
          format: "markdown",
          extension: ".md",
        })
      );
    });

    it("supports custom formats override list", () => {
      const customFormats: ExportFormatOption[] = [
        { format: "markdown", label: "Custom Markdown", extension: ".md" },
      ];

      render(
        <ExportMenu open formats={customFormats} />
      );

      expect(screen.getByRole("menuitem", { name: /custom markdown/i })).toBeDefined();
      expect(screen.queryByRole("menuitem", { name: /anki/i })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: /json/i })).toBeNull();
    });
  });
});
