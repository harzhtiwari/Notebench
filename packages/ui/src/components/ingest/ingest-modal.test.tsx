// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { IngestModal, DropOverlay, ProgressRow } from "./index.js";
import { Chip } from "../primitives/chips.js";

afterEach(() => {
  cleanup();
});

describe("ingest modal patterns (ticket 08)", () => {
  it("Chip renders the board shape with pressed state and label", () => {
    render(
      <Chip pressed onClick={() => {}}>
        PDFs 1
      </Chip>
    );
    const chip = screen.getByRole("button", { name: "PDFs 1" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("Chip soft-cap variant shows the 50+ sources copy", () => {
    render(<Chip variant="warn">50+ sources</Chip>);
    expect(screen.getByText("50+ sources")).toBeDefined();
  });

  it("DropOverlay announces the drop target when active", () => {
    render(<DropOverlay active />);
    expect(screen.getByText("Drop files to add sources")).toBeDefined();
  });

  it("ProgressRow exposes a progressbar with value and source name", () => {
    render(
      <ProgressRow
        name="Grid study 2024.pdf"
        format="pdf"
        state="parsing"
        value={62}
      />
    );
    expect(screen.getByText("Grid study 2024.pdf")).toBeDefined();
    const bar = screen.getByRole("progressbar", { name: "Grid study 2024.pdf" });
    expect(bar.getAttribute("aria-valuenow")).toBe("62");
  });

  it("ProgressRow ready shows the Indexed badge", () => {
    render(
      <ProgressRow
        name="Grid study 2024.pdf"
        format="pdf"
        state="ready"
        value={100}
      />
    );
    expect(screen.getByText("Indexed")).toBeDefined();
  });

  it("ProgressRow renders the per-format web ready fixture", () => {
    const { container } = render(
      <ProgressRow
        name="arXiv: Decentralized SLAM"
        format="web"
        state="ready"
        value={100}
      />
    );
    expect(screen.getByText("arXiv: Decentralized SLAM")).toBeDefined();
    expect(screen.getByText("Indexed")).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("ProgressRow failed shows the reason", () => {
    render(
      <ProgressRow
        name="scan.pdf"
        format="pdf"
        state="failed"
        value={40}
        error="Unsupported encryption."
      />
    );
    expect(screen.getByText("Unsupported encryption.")).toBeDefined();
  });

  it("IngestModal opens a dialog with three channel tabs", () => {
    render(<IngestModal open onOpenChange={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Add sources" })
    ).toBeDefined();
    expect(screen.getByRole("tab", { name: "Upload" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Web Link" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Paste Text" })).toBeDefined();
  });

  it("IngestModal switches channel content on tab select", () => {
    render(<IngestModal open onOpenChange={() => {}} defaultChannel="url" />);
    expect(screen.getByLabelText("Web address")).toBeDefined();
    const pasteTab = screen.getByRole("tab", { name: "Paste Text" });
    pasteTab.focus();
    fireEvent.keyDown(pasteTab, { key: "Enter" });
    expect(screen.getByLabelText("Note text")).toBeDefined();
  });
});
