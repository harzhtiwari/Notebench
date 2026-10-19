// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ExportDialog, FormatOptionRow } from "./index.js";
import { FileZipIcon, FileDocIcon, ArchiveIcon } from "../primitives/index.js";

afterEach(() => {
  cleanup();
});

describe("export and import dialog patterns (ticket 19)", () => {
  it("FormatOptionRow renders icon, label, description, and unselected state", () => {
    const { container } = render(
      <FormatOptionRow
        icon={FileZipIcon}
        label="ZIP archive"
        description="Complete notebook with sources and artifacts."
        selected={false}
      />
    );
    const row = screen.getByRole("radio", { name: /ZIP archive/i });
    expect(row).toBeDefined();
    expect(row.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByText("Complete notebook with sources and artifacts.")
    ).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("FormatOptionRow renders selected state and notifies on select", () => {
    const onSelect = vi.fn();
    render(
      <FormatOptionRow
        icon={FileDocIcon}
        label="DOCX document"
        description="Formatted text document."
        selected={true}
        onSelect={onSelect}
      />
    );
    const row = screen.getByRole("radio", { name: /DOCX document/i });
    expect(row.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("FormatOptionRow supports children as label and handles disabled state", () => {
    const onSelect = vi.fn();
    render(
      <FormatOptionRow
        icon={ArchiveIcon}
        disabled
        onSelect={onSelect}
      >
        Custom format
      </FormatOptionRow>
    );
    const row = screen.getByRole("radio", { name: /Custom format/i });
    expect(row).toHaveProperty("disabled", true);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ExportDialog renders dialog with title, description, and format options", () => {
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        description: "Complete notebook with sources and artifacts.",
        icon: ArchiveIcon,
      },
      {
        id: "docx",
        label: "DOCX",
        description: "Formatted Microsoft Word document.",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export notebook"
        description="Choose a file format to export your notebook."
        formats={formats}
        defaultFormat="zip"
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Export notebook" })
    ).toBeDefined();
    expect(
      screen.getByText("Choose a file format to export your notebook.")
    ).toBeDefined();
    expect(screen.getByRole("radio", { name: /ZIP archive/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /DOCX/i })).toBeDefined();
  });

  it("ExportDialog preselects default format", () => {
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        description: "Complete archive.",
        icon: FileZipIcon,
      },
      {
        id: "docx",
        label: "DOCX document",
        description: "Word document.",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export"
        formats={formats}
        defaultFormat="docx"
      />
    );

    const zipOption = screen.getByRole("radio", { name: /ZIP archive/i });
    const docxOption = screen.getByRole("radio", { name: /DOCX document/i });

    expect(zipOption.getAttribute("aria-checked")).toBe("false");
    expect(docxOption.getAttribute("aria-checked")).toBe("true");
  });

  it("ExportDialog defaults to first format when no defaultFormat is provided", () => {
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        description: "Complete archive.",
        icon: FileZipIcon,
      },
      {
        id: "docx",
        label: "DOCX document",
        description: "Word document.",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export"
        formats={formats}
      />
    );

    const zipOption = screen.getByRole("radio", { name: /ZIP archive/i });
    expect(zipOption.getAttribute("aria-checked")).toBe("true");
  });

  it("ExportDialog supports controlled selectedFormat", () => {
    const onFormatChange = vi.fn();
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        icon: FileZipIcon,
      },
      {
        id: "docx",
        label: "DOCX document",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export"
        formats={formats}
        selectedFormat="docx"
        onFormatChange={onFormatChange}
      />
    );

    const zipOption = screen.getByRole("radio", { name: /ZIP archive/i });
    const docxOption = screen.getByRole("radio", { name: /DOCX document/i });

    expect(docxOption.getAttribute("aria-checked")).toBe("true");
    expect(zipOption.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(zipOption);
    expect(onFormatChange).toHaveBeenCalledWith("zip");
  });

  it("ExportDialog switches selection when clicking a format option", () => {
    const onFormatChange = vi.fn();
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        description: "Complete archive.",
        icon: FileZipIcon,
      },
      {
        id: "docx",
        label: "DOCX document",
        description: "Word document.",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export"
        formats={formats}
        defaultFormat="zip"
        onFormatChange={onFormatChange}
      />
    );

    const zipOption = screen.getByRole("radio", { name: /ZIP archive/i });
    const docxOption = screen.getByRole("radio", { name: /DOCX document/i });

    expect(zipOption.getAttribute("aria-checked")).toBe("true");
    expect(docxOption.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(docxOption);

    expect(docxOption.getAttribute("aria-checked")).toBe("true");
    expect(zipOption.getAttribute("aria-checked")).toBe("false");
    expect(onFormatChange).toHaveBeenCalledWith("docx");
  });

  it("ExportDialog triggers onExport with selected format when clicking Export button", () => {
    const onExport = vi.fn();
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        description: "Complete archive.",
        icon: FileZipIcon,
      },
      {
        id: "docx",
        label: "DOCX document",
        description: "Word document.",
        icon: FileDocIcon,
      },
    ];

    render(
      <ExportDialog
        open
        title="Export"
        formats={formats}
        defaultFormat="zip"
        onExport={onExport}
      />
    );

    // Switch to docx
    const docxOption = screen.getByRole("radio", { name: /DOCX document/i });
    fireEvent.click(docxOption);

    // Click export action
    const exportButton = screen.getByRole("button", { name: "Export" });
    fireEvent.click(exportButton);

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith("docx");
  });

  it("ExportDialog disables export button when isExporting is true", () => {
    const onExport = vi.fn();
    const formats = [
      {
        id: "zip",
        label: "ZIP archive",
        icon: FileZipIcon,
      },
    ];

    render(
      <ExportDialog
        open
        formats={formats}
        defaultFormat="zip"
        isExporting={true}
        onExport={onExport}
      />
    );

    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).toHaveProperty("disabled", true);
    fireEvent.click(exportButton);
    expect(onExport).not.toHaveBeenCalled();
  });
});
