// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { CitationPopover, HistoryRow } from "./index.js";
import { CitationChip } from "../primitives/citations.js";

afterEach(() => {
  cleanup();
});

describe("Citation and history patterns (ticket 11)", () => {
  describe("CitationChip", () => {
    it("renders normal cite chip with label and board .cite styling", () => {
      render(<CitationChip label="p. 12" />);
      const chip = screen.getByRole("button", { name: "p. 12" });
      expect(chip).toBeDefined();
      expect(chip.className).toContain("cite");
      expect(chip.getAttribute("aria-current")).toBeNull();
      expect(chip.className).not.toContain("cite--missing");
    });

    it("renders current state with aria-current='true'", () => {
      render(<CitationChip label="14:32" current />);
      const chip = screen.getByRole("button", { name: "14:32" });
      expect(chip.getAttribute("aria-current")).toBe("true");
    });

    it("renders current state when state='current' is passed", () => {
      render(<CitationChip label="p. 31" state="current" />);
      const chip = screen.getByRole("button", { name: "p. 31" });
      expect(chip.getAttribute("aria-current")).toBe("true");
    });

    it("renders missing / source removed state with .cite--missing and warning icon", () => {
      const { container } = render(<CitationChip missing />);
      const chip = screen.getByRole("button", { name: /Source removed/i });
      expect(chip.className).toContain("cite--missing");
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("renders missing state with custom label when provided", () => {
      render(<CitationChip missing label="[Source Removed]" />);
      const chip = screen.getByRole("button", { name: /\[Source Removed\]/i });
      expect(chip.className).toContain("cite--missing");
    });

    it("supports click interactions", () => {
      const handleClick = vi.fn();
      render(<CitationChip label="p. 5" onClick={handleClick} />);
      const chip = screen.getByRole("button", { name: "p. 5" });
      fireEvent.click(chip);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("CitationPopover", () => {
    it("renders trigger and displays title, location, passage, and Quotes icon when opened", () => {
      const { container } = render(
        <CitationPopover
          open
          title="Grid study 2024"
          location="Page 12, paragraph 2"
          passage="Evening peak demand moved from 6 pm to 8 pm after the 2023 tariff change."
        >
          <CitationChip label="p. 12" />
        </CitationPopover>
      );

      expect(screen.getByText("Grid study 2024")).toBeDefined();
      expect(screen.getByText("Page 12, paragraph 2")).toBeDefined();
      expect(
        screen.getByText(/Evening peak demand moved from 6 pm to 8 pm/)
      ).toBeDefined();

      const passageEl = screen.getByText(/Evening peak demand moved from 6 pm to 8 pm/).closest(".passage");
      expect(passageEl).not.toBeNull();
      // Verifies Quotes icon is present in the popover
      expect(container.querySelector("svg") || document.body.querySelector("svg")).not.toBeNull();
    });

    it("renders Open in source action and fires callback on click", () => {
      const handleOpenSource = vi.fn();
      render(
        <CitationPopover
          open
          title="Grid study 2024"
          excerpt="Excerpt text here."
          onOpenSource={handleOpenSource}
        >
          <CitationChip label="p. 12" />
        </CitationPopover>
      );

      const actionBtn = screen.getByRole("button", { name: "Open in source" });
      fireEvent.click(actionBtn);
      expect(handleOpenSource).toHaveBeenCalledTimes(1);
    });

    it("supports custom openSourceLabel", () => {
      const handleOpenSource = vi.fn();
      render(
        <CitationPopover
          open
          title="Grid study 2024"
          excerpt="Excerpt text here."
          openSourceLabel="Open in Source Viewer"
          onOpenSource={handleOpenSource}
        >
          <CitationChip label="p. 12" />
        </CitationPopover>
      );

      expect(screen.getByRole("button", { name: "Open in Source Viewer" })).toBeDefined();
    });
  });

  describe("HistoryRow", () => {
    it("renders question text and relative timestamp with ClockCounterClockwise icon", () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { container } = render(
        <HistoryRow
          question="What was the tariff shift in 2023?"
          timestamp={pastTime}
        />
      );

      expect(screen.getByText("What was the tariff shift in 2023?")).toBeDefined();
      expect(screen.getByText("5m ago")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("renders custom time string if provided", () => {
      render(
        <HistoryRow
          question="Explain peak demand"
          time="yesterday"
        />
      );
      expect(screen.getByText("yesterday")).toBeDefined();
    });

    it("renders action affordance with ArrowUUpLeft icon and handles click", () => {
      const handleSelect = vi.fn();
      const handleAction = vi.fn();
      render(
        <HistoryRow
          question="Explain peak demand"
          onSelect={handleSelect}
          onAction={handleAction}
          actionLabel="Reuse question"
        />
      );

      const actionBtn = screen.getByRole("button", { name: "Reuse question" });
      expect(actionBtn).toBeDefined();
      fireEvent.click(actionBtn);
      expect(handleAction).toHaveBeenCalledWith("Explain peak demand");
      expect(handleSelect).not.toHaveBeenCalled();
    });

    it("clicking the row triggers onSelect", () => {
      const handleSelect = vi.fn();
      render(
        <HistoryRow
          question="Tell me about renewable trends"
          onSelect={handleSelect}
        />
      );

      const text = screen.getByText("Tell me about renewable trends");
      fireEvent.click(text);
      expect(handleSelect).toHaveBeenCalledWith("Tell me about renewable trends");
    });

    it("keeps the row and its action as separate, non-nested controls", () => {
      const { container } = render(
        <HistoryRow
          question="Explain peak demand"
          onSelect={() => {}}
          onAction={() => {}}
        />
      );

      // The action button must not live inside another interactive control.
      expect(container.querySelector('[role="button"]')).toBeNull();
    });

    it("selects from the question control and fires the action independently", () => {
      const handleSelect = vi.fn();
      const handleAction = vi.fn();
      render(
        <HistoryRow
          question="Pick me"
          onSelect={handleSelect}
          onAction={handleAction}
        />
      );

      fireEvent.click(screen.getByText("Pick me"));
      expect(handleSelect).toHaveBeenCalledWith("Pick me");

      fireEvent.click(screen.getByRole("button", { name: "Reuse question" }));
      expect(handleAction).toHaveBeenCalledWith("Pick me");
      expect(handleSelect).toHaveBeenCalledTimes(1);
    });
  });
});
