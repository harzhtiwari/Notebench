// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { Button } from "./button.js";
import { EmptyState, EmptyStateActions, EmptyList, RefusalEmpty } from "./empty.js";

afterEach(() => {
  cleanup();
});

function emptyRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild;
  expect(root).not.toBeNull();
  return root as HTMLElement;
}

describe("EmptyState Primitive", () => {
  it("renders container on well background with card radius and no shadow", () => {
    const { container } = render(<EmptyState title="No sources yet" />);
    const root = emptyRoot(container);

    expect(root.className).toContain("empty");
    expect(root.className).toContain("bg-[var(--nb-well)]");
    expect(root.className).toContain("rounded-[var(--nb-radius-card)]");
    expect(root.className).toContain("py-[var(--nb-space-8)]");
    expect(root.className).toContain("px-[var(--nb-space-6)]");
    expect(root.className).toContain("gap-[var(--nb-space-3)]");
    expect(root.className).toContain("justify-items-start");
    expect(root.className).toContain("max-w-[var(--nb-layout-modal-sm)]");
    expect(root.className).not.toContain("shadow");
  });

  it("renders serif title and UI sans description", () => {
    render(
      <EmptyState
        title="No sources yet"
        description="Add something to read. Every answer cites these sources."
      />
    );

    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toBe("No sources yet");
    expect(heading.className).toContain("font-[family-name:var(--nb-font-read)]");
    expect(heading.className).toContain("text-[length:var(--nb-text-xl)]");
    expect(heading.className).toContain("font-semibold");

    const description = screen.getByText(
      "Add something to read. Every answer cites these sources."
    );
    expect(description.className).toContain("text-[length:var(--nb-text-sm)]");
    expect(description.className).toContain("text-[var(--nb-ink-2)]");
  });

  it("renders milestone badge and announcement label", () => {
    render(
      <EmptyState
        title="Memory Rules"
        milestone="0.3"
        milestoneText="Memory rules arrive in 0.3"
      />
    );

    expect(screen.getByText("Coming in 0.3")).toBeDefined();
    expect(screen.getByText("Memory rules arrive in 0.3")).toBeDefined();
  });

  it("renders primary and secondary action buttons", () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        actionLabel="Create notebook"
        onAction={onAction}
        secondaryActionLabel="Import"
        onSecondaryAction={onSecondaryAction}
      />
    );

    const primary = screen.getByRole("button", { name: "Create notebook" });
    expect(primary.className).toContain("bg-[var(--nb-ink)]");
    fireEvent.click(primary);
    expect(onAction).toHaveBeenCalledTimes(1);

    const secondary = screen.getByRole("button", { name: "Import" });
    expect(secondary.className).toContain("bg-[var(--nb-sheet)]");
    fireEvent.click(secondary);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it("renders inactive roadmap items list with milestone tags", () => {
    const { container } = render(
      <EmptyState
        title="Memory Rules"
        milestone="0.3"
        items={[
          "Always cite page numbers for legal sources",
          { id: "concise", text: "Keep technical explanations concise", disabled: true },
        ]}
      />
    );

    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.className).toContain("cursor-not-allowed");
      expect(row.textContent).toContain("Coming in 0.3");
    }
    expect(screen.getByText("Always cite page numbers for legal sources")).toBeDefined();
    expect(screen.getByText("Keep technical explanations concise")).toBeDefined();
  });

  it("honours the maxWidth variants", () => {
    const { container: md } = render(<EmptyState title="Wide" maxWidth="md" />);
    expect(emptyRoot(md).className).toContain("max-w-[var(--nb-layout-modal-md)]");
    cleanup();
    const { container: lg } = render(<EmptyState title="Wider" maxWidth="lg" />);
    expect(emptyRoot(lg).className).toContain("max-w-[var(--nb-layout-modal-lg)]");
    cleanup();
    const { container: full } = render(<EmptyState title="Full" maxWidth="full" />);
    expect(emptyRoot(full).className).not.toContain("max-w-[");
  });

  describe("EmptyList backward-compatibility adapter", () => {
    it("renders the default Memory Rules milestone state", () => {
      render(<EmptyList />);

      expect(screen.getByRole("heading", { name: /Memory Rules/i })).toBeDefined();
      expect(screen.getByText(/Memory rules arrive in 0\.3/i)).toBeDefined();
      expect(screen.getByText("Coming in 0.3")).toBeDefined();
    });

    it("renders custom title, description, and entity fallback", () => {
      render(
        <EmptyList
          title="No Audit Findings"
          description="All registered controls passed reader/writer truth verification."
          entityName="audit items"
        />
      );

      expect(screen.getByText("No Audit Findings")).toBeDefined();
      expect(
        screen.getByText("All registered controls passed reader/writer truth verification.")
      ).toBeDefined();
    });

    it("derives a title from entityName when title is missing", () => {
      render(<EmptyList entityName="trashed items" milestone={undefined} />);
      expect(screen.getByText("No trashed items yet")).toBeDefined();
    });

    it("triggers the action callback when the action button is clicked", () => {
      const onAction = vi.fn();
      render(<EmptyList actionLabel="Refresh Audit" onAction={onAction} />);

      fireEvent.click(screen.getByRole("button", { name: "Refresh Audit" }));
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("renders inactive list items with milestone badges", () => {
      const { container } = render(<EmptyList items={["Rule one", "Rule two"]} />);

      expect(screen.getByText("Rule one")).toBeDefined();
      expect(screen.getByText("Rule two")).toBeDefined();

      const rows = container.querySelectorAll("li");
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.textContent).toContain("Coming in 0.3");
      }
    });
  });

  describe("RefusalEmpty adapter", () => {
    it("renders the no-sources refusal state", () => {
      render(<RefusalEmpty reason="no-sources" />);

      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "No sources selected"
      );
      expect(screen.getByText(/Select at least one source/)).toBeDefined();
    });

    it("renders topic context for low-confidence refusals", () => {
      render(
        <RefusalEmpty
          reason="low-confidence"
          topic="quantum computing"
          availableTopics={["revenue growth", "churn analysis"]}
        />
      );

      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "Not found in sources"
      );
      expect(screen.getByText(/quantum computing/)).toBeDefined();
      expect(screen.getByText(/revenue growth, churn analysis/)).toBeDefined();
    });

    it("renders an action button and fires the callback", () => {
      const onAction = vi.fn();
      render(
        <RefusalEmpty
          reason="no-sources"
          actionLabel="Select all sources"
          onAction={onAction}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Select all sources" }));
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Board Canonical Showcase Assertions (board.test.html#L1059)", () => {
    it("renders Canonical Example 5: 'No sources yet' (Empty State with 3 buttons)", () => {
      const handleUpload = vi.fn();
      const handlePaste = vi.fn();
      const handleAddUrl = vi.fn();
      const { container } = render(
        <EmptyState
          title="No sources yet"
          description="Add something to read. Every answer and output cites these sources by page, paragraph or timestamp."
        >
          <EmptyStateActions>
            <Button variant="nb_btn_primary" onClick={handleUpload}>
              Upload files
            </Button>
            <Button variant="nb_btn_secondary" onClick={handlePaste}>
              Paste text
            </Button>
            <Button variant="nb_btn_secondary" onClick={handleAddUrl}>
              Add URLs
            </Button>
          </EmptyStateActions>
        </EmptyState>
      );
      const root = emptyRoot(container);

      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("No sources yet");
      expect(
        screen.getByText(
          "Add something to read. Every answer and output cites these sources by page, paragraph or timestamp."
        )
      ).toBeDefined();

      const upload = screen.getByRole("button", { name: "Upload files" });
      expect(upload.className).toContain("bg-[var(--nb-ink)]");
      fireEvent.click(upload);
      expect(handleUpload).toHaveBeenCalledTimes(1);

      const paste = screen.getByRole("button", { name: "Paste text" });
      expect(paste.className).toContain("bg-[var(--nb-sheet)]");
      fireEvent.click(paste);
      expect(handlePaste).toHaveBeenCalledTimes(1);

      const urlsButton = screen.getByRole("button", { name: "Add URLs" });
      expect(urlsButton.className).toContain("bg-[var(--nb-sheet)]");
      fireEvent.click(urlsButton);
      expect(handleAddUrl).toHaveBeenCalledTimes(1);

      expect(root.className).toContain("bg-[var(--nb-well)]");
      expect(root.className).toContain("rounded-[var(--nb-radius-card)]");
      expect(root.className).toContain("max-w-[var(--nb-layout-modal-sm)]");
      expect(root.className).not.toContain("shadow");
    });
  });
});
