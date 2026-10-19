// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  CitationChip,
  CitationTooltip,
  CitationHighlight,
  CitationPassage,
} from "./citations.js";

afterEach(() => {
  cleanup();
});

describe("CitationChip", () => {
  it("renders the normal state on the marker fill with tabular numbers", () => {
    render(<CitationChip label="p. 12" />);
    const chip = screen.getByRole("button", { name: "p. 12" });
    expect(chip.className).toContain("cite");
    expect(chip.className).toContain("tabular-nums");
    expect(chip.className).toContain("bg-[var(--nb-marker)]");
    expect(chip.className).toContain("text-[var(--nb-on-marker)]");
    expect(chip.className).toContain("border-[var(--nb-marker-text)]");
    expect(chip.className).toContain("min-h-[var(--nb-size-target-min)]");
    expect(chip.dataset["state"]).toBe("normal");
    expect(chip.getAttribute("aria-current")).toBeNull();
    expect(chip.className).not.toContain("cite--missing");
  });

  it("derives 'p. N' from the pageNumber convenience prop", () => {
    render(<CitationChip pageNumber={12} />);
    expect(screen.getByRole("button", { name: "p. 12" })).toBeDefined();
  });

  it("marks the current citation with aria-current and the ink fill", () => {
    render(<CitationChip label="14:32" current />);
    const chip = screen.getByRole("button", { name: "14:32" });
    expect(chip.getAttribute("aria-current")).toBe("true");
    expect(chip.dataset["state"]).toBe("current");
    expect(chip.className).toContain("bg-[var(--nb-ink)]");
    expect(chip.className).toContain("text-[var(--nb-ink-inv)]");
  });

  it("treats state='current' as current", () => {
    render(<CitationChip label="p. 31" state="current" />);
    const chip = screen.getByRole("button", { name: "p. 31" });
    expect(chip.getAttribute("aria-current")).toBe("true");
    expect(chip.dataset["state"]).toBe("current");
  });

  it("renders the missing state with .cite--missing and a warning icon", () => {
    const { container } = render(<CitationChip missing />);
    const chip = screen.getByRole("button", { name: /Source removed/i });
    expect(chip.className).toContain("cite--missing");
    expect(chip.className).toContain("bg-[var(--nb-warn-wash)]");
    expect(chip.className).toContain("text-[var(--nb-warn)]");
    expect(chip.dataset["state"]).toBe("missing");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("keeps a custom label in the missing state", () => {
    render(<CitationChip missing label="[Source Removed]" />);
    const chip = screen.getByRole("button", { name: /\[Source Removed\]/i });
    expect(chip.className).toContain("cite--missing");
  });

  it("supports click interactions", () => {
    const handleClick = vi.fn();
    render(<CitationChip label="p. 5" onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button", { name: "p. 5" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe("CitationTooltip", () => {
  it("renders its trigger with the 'Source: title, label' accessible name", () => {
    render(
      <CitationTooltip
        label="p. 12"
        title="Grid study 2024"
        excerpt="Evening peak demand moved."
      />
    );
    expect(
      screen.getByRole("button", { name: "Source: Grid study 2024, p. 12" })
    ).toBeDefined();
  });

  it("passes through a custom className to the trigger", () => {
    render(
      <CitationTooltip
        label="p. 12"
        title="Grid study 2024"
        excerpt="Evening peak demand moved."
        className="tooltip-extra"
      />
    );
    expect(
      screen.getByRole("button", { name: "Source: Grid study 2024, p. 12" })
        .className
    ).toContain("tooltip-extra");
  });
});

describe("CitationHighlight", () => {
  it("renders the .hl swipe highlight with marker tokens", () => {
    render(<CitationHighlight>41% of the evening gap</CitationHighlight>);
    const highlight = screen.getByText("41% of the evening gap");
    expect(highlight.tagName).toBe("SPAN");
    expect(highlight.className).toContain("hl");
    expect(highlight.className).toContain("bg-[var(--nb-marker-swipe)]");
    expect(highlight.className).toContain("text-[var(--nb-ink)]");
    expect(highlight.className).toContain("px-[var(--nb-space-0-5)]");
  });

  it("forwards extra attributes and merges className", () => {
    render(
      <CitationHighlight className="extra-hl" data-citation-id="c-1">
        Highlighted
      </CitationHighlight>
    );
    const highlight = screen.getByText("Highlighted");
    expect(highlight.className).toContain("extra-hl");
    expect(highlight.dataset["citationId"]).toBe("c-1");
  });
});

describe("CitationPassage", () => {
  it("renders the .passage well with the read font and leading", () => {
    render(<CitationPassage>Evening peak demand moved.</CitationPassage>);
    const passage = screen.getByText("Evening peak demand moved.");
    expect(passage.tagName).toBe("P");
    expect(passage.className).toContain("passage");
    expect(passage.className).toContain("bg-[var(--nb-marker-wash)]");
    expect(passage.className).toContain("rounded-[var(--nb-radius-well)]");
    expect(passage.className).toContain("font-[family-name:var(--nb-font-read)]");
    expect(passage.className).toContain("leading-[var(--nb-leading-read)]");
    expect(passage.className).toContain("p-[var(--nb-space-3)]");
  });
});
