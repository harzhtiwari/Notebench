// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ViewerModal,
  CheckboxRow,
  CitationTooltip,
  OpenInViewerRow,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("viewer and selection patterns (ticket 09)", () => {
  it("CheckboxRow pairs the Square icon with its label when unchecked", () => {
    const { container } = render(
      <CheckboxRow checked={false} onChange={() => {}}>
        Use Grid study 2024 in this task
      </CheckboxRow>
    );
    const box = screen.getByRole("checkbox", {
      name: "Use Grid study 2024 in this task",
    });
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("CheckboxRow shows CheckSquare when checked and notifies on toggle", () => {
    const onChange = vi.fn();
    render(
      <CheckboxRow checked onChange={onChange}>
        Use Grid study 2024 in this task
      </CheckboxRow>
    );
    const box = screen.getByRole("checkbox", {
      name: "Use Grid study 2024 in this task",
    });
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("CitationTooltip renders the cite label with title and excerpt", () => {
    render(
      <CitationTooltip label="p. 12" title="Grid study 2024" excerpt="Evening peak demand moved." />
    );
    expect(
      screen.getByRole("button", { name: "Source: Grid study 2024, p. 12" })
    ).toBeDefined();
  });

  it("ViewerModal opens a dialog with title and page navigation", () => {
    render(
      <ViewerModal
        open
        onOpenChange={() => {}}
        title="Grid study 2024.pdf"
        page={12}
        pageCount={48}
        onPageChange={() => {}}
      />
    );
    expect(
      screen.getByRole("dialog", { name: "Grid study 2024.pdf" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Previous page" })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDefined();
    expect(screen.getByText("Page 12 of 48")).toBeDefined();
  });

  it("ViewerModal highlights the cited passage", () => {
    render(
      <ViewerModal
        open
        onOpenChange={() => {}}
        title="Grid study 2024.pdf"
        page={12}
        pageCount={48}
        onPageChange={() => {}}
        citedPassage="moved from 6 pm to 8 pm"
      />
    );
    expect(screen.getByText("moved from 6 pm to 8 pm")).toBeDefined();
  });

  it("ViewerModal notifies on page change and clamps the ends", () => {
    const onPageChange = vi.fn();
    render(
      <ViewerModal
        open
        onOpenChange={() => {}}
        title="Grid study 2024.pdf"
        page={1}
        pageCount={48}
        onPageChange={onPageChange}
      />
    );
    expect(
      screen.getByRole("button", { name: "Previous page" })
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("OpenInViewerRow renders the copy and notifies on open", () => {
    const onOpen = vi.fn();
    render(<OpenInViewerRow onOpen={onOpen} />);
    const row = screen.getByRole("button", { name: "Open in Source Viewer" });
    expect(row).toBeDefined();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
