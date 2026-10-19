// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  TimelineTrack,
  TimelineEvent,
  isValidTimelineDate,
  formatTimelineDate,
  sortTimelineEvents,
  type TimelineEventItem,
} from "./index.js";
import { GitBranchIcon } from "../primitives/index.js";

afterEach(() => {
  cleanup();
});

describe("timeline patterns (ticket 17)", () => {
  const sampleEvents: TimelineEventItem[] = [
    {
      id: "ev-3",
      date: "2024-05-15",
      title: "Public Release",
      description: "Version 1.0 launched worldwide with full feature set.",
    },
    {
      id: "ev-1",
      date: "1776",
      title: "Declaration of Independence",
      description: "Historic event with year-only dating.",
    },
    {
      id: "ev-4",
      date: "unknown",
      title: "Undated Speculative Research",
      description: "Future milestone with date to be determined.",
    },
    {
      id: "ev-2",
      date: "1999-12-31",
      title: "Millennium Eve",
      description: "Preparations for Y2K transition.",
    },
  ];

  describe("TimelineTrack", () => {
    it("renders ordered list container with timeline-track semantic class and accessible role", () => {
      const { container } = render(
        <TimelineTrack aria-label="Project Milestones">
          <TimelineEvent id="1" title="Initial Step" date="2024-01-01" />
        </TimelineTrack>
      );

      const track = container.querySelector("ol");
      expect(track).not.toBeNull();
      expect(track?.className).toContain("timeline-track");
      expect(track?.getAttribute("aria-label")).toBe("Project Milestones");
    });

    it("enforces elevation shadow invariant (zero shadow-float or shadow-xs on in-page track)", () => {
      const { container } = render(
        <TimelineTrack>
          <TimelineEvent id="1" title="First" date="2024-01-01" />
        </TimelineTrack>
      );

      const html = container.innerHTML;
      expect(html).not.toContain("shadow-[var(--nb-shadow-float)]");
      expect(html).not.toContain("shadow-xs");
      expect(html).not.toContain("shadow-sm");
      expect(html).not.toContain("shadow-md");
      expect(html).not.toContain("shadow-lg");
    });

    it("automatically sorts events chronologically with unknown-date entries placed last", () => {
      render(<TimelineTrack events={sampleEvents} />);

      const eventTitles = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
      expect(eventTitles).toEqual([
        "Declaration of Independence", // 1776
        "Millennium Eve",              // 1999-12-31
        "Public Release",              // 2024-05-15
        "Undated Speculative Research" // unknown (sorts last)
      ]);
    });

    it("supports reverse chronological sorting with sortDirection='desc' (unknown dates still last)", () => {
      render(<TimelineTrack events={sampleEvents} sortDirection="desc" />);

      const eventTitles = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
      expect(eventTitles).toEqual([
        "Public Release",              // 2024-05-15
        "Millennium Eve",              // 1999-12-31
        "Declaration of Independence", // 1776
        "Undated Speculative Research" // unknown (still last)
      ]);
    });
  });

  describe("TimelineEvent", () => {
    it("renders event item with formatted date, title, and description", () => {
      render(
        <TimelineEvent
          id="test-1"
          date="2024-04-12"
          title="Architecture Review"
          description="Reviewed dual-dialect SQLite and Postgres storage engine."
        />
      );

      expect(screen.getByText("Architecture Review")).toBeDefined();
      expect(
        screen.getByText("Reviewed dual-dialect SQLite and Postgres storage engine.")
      ).toBeDefined();

      const timeEl = screen.getByText(/Apr 12, 2024/i);
      expect(timeEl.tagName.toLowerCase()).toBe("time");
      expect(timeEl.getAttribute("dateTime")).toBe("2024-04-12");
    });

    it("accepts and displays year-only date accurately", () => {
      render(
        <TimelineEvent
          id="test-year"
          date="1776"
          title="Historical Declaration"
          description="Document signed."
        />
      );

      const timeEl = screen.getByText("1776");
      expect(timeEl).toBeDefined();
      expect(timeEl.tagName.toLowerCase()).toBe("time");
    });

    it("renders unknown/undated events with explicit label and icon (never color-alone)", () => {
      const { container } = render(
        <TimelineEvent
          id="test-undated"
          date="unknown"
          title="Future Roadmap Goal"
          description="Exact date not yet known."
        />
      );

      // Must have visible text label
      expect(screen.getByText("Date unknown")).toBeDefined();

      // Must have icon accompanying the undated label (never color-alone)
      const badge = container.querySelector('[data-slot="date-badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.querySelector("svg")).not.toBeNull();
    });

    it("renders locked state pairing Lock icon with 'Locked' text label (never color-alone)", () => {
      const { container } = render(
        <TimelineEvent
          id="test-locked"
          date="2024-01-01"
          title="Baseline Commit"
          description="Immutable baseline."
          locked
        />
      );

      const lockedBadge = container.querySelector('[data-slot="locked-badge"]');
      expect(lockedBadge).not.toBeNull();
      expect(lockedBadge?.textContent).toContain("Locked");
      expect(lockedBadge?.querySelector("svg")).not.toBeNull();
    });

    it("renders milestone state pairing GitBranch icon with 'Milestone' text label (never color-alone)", () => {
      const { container } = render(
        <TimelineEvent
          id="test-milestone"
          date="2024-06-01"
          title="M5 Release"
          description="Major release milestone."
          state="milestone"
        />
      );

      const stateBadge = container.querySelector('[data-slot="state-badge"]');
      expect(stateBadge).not.toBeNull();
      expect(stateBadge?.textContent).toContain("Milestone");
      expect(stateBadge?.querySelector("svg")).not.toBeNull();
    });

    it("renders custom tools slot", () => {
      render(
        <TimelineEvent
          id="test-tools"
          date="2024-01-01"
          title="With Tools"
          tools={<button type="button">Edit Event</button>}
        />
      );

      expect(screen.getByRole("button", { name: "Edit Event" })).toBeDefined();
    });

    it("renders no trailing connector spine for a standalone event", () => {
      const { container } = render(
        <TimelineEvent id="solo" date="2024-01-01" title="Solo event" />
      );

      expect(container.querySelector(':scope li > span[aria-hidden="true"]')).toBeNull();
    });
  });

  describe("Icon Centralization & GitBranch", () => {
    it("exports GitBranch from centralized icons", () => {
      expect(GitBranchIcon).toBeDefined();
      const { container } = render(<GitBranchIcon size={16} aria-hidden="true" />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });

    it("uses GitBranch as the default node indicator icon with aria-hidden", () => {
      const { container } = render(
        <TimelineEvent id="test-node" date="2024-01-01" title="Node Test" />
      );

      const nodeMarker = container.querySelector('[data-slot="timeline-marker"]');
      expect(nodeMarker).not.toBeNull();
      const svg = nodeMarker?.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("CitationPopover reuse", () => {
    it("renders citation chips and opens existing CitationPopover on click", async () => {
      const onOpenSource = vi.fn();
      render(
        <TimelineEvent
          id="test-cite"
          date="2024-04-12"
          title="Citations Event"
          description="Event with grounding evidence."
          citations={[
            {
              id: "c-1",
              title: "System Architecture Spec",
              location: "Page 4, paragraph 2",
              passage: "Fastify is the sole execution entrypoint and production composition root.",
              onOpenSource,
            },
          ]}
        />
      );

      // Citation chip is rendered
      const citeTrigger = screen.getByRole("button", { name: /Citation/i });
      expect(citeTrigger).toBeDefined();

      // Click to open citation popover
      fireEvent.click(citeTrigger);

      // Popover content from CitationPopover is rendered
      expect(await screen.findByText("System Architecture Spec")).toBeDefined();
      expect(screen.getByText("Page 4, paragraph 2")).toBeDefined();
      expect(
        screen.getByText("Fastify is the sole execution entrypoint and production composition root.")
      ).toBeDefined();

      // Action button "Open in source"
      const openBtn = screen.getByRole("button", { name: "Open in source" });
      expect(openBtn).toBeDefined();
      fireEvent.click(openBtn);
      expect(onOpenSource).toHaveBeenCalledTimes(1);
    });
  });

  describe("Date validation and sorting helpers", () => {
    it("isValidTimelineDate validates ISO dates and year-only strings, rejecting invalid strings", () => {
      expect(isValidTimelineDate("2024-04-12")).toBe(true);
      expect(isValidTimelineDate("2024-04-12T10:30:00Z")).toBe(true);
      expect(isValidTimelineDate("1776")).toBe(true);
      expect(isValidTimelineDate("2024")).toBe(true);

      expect(isValidTimelineDate("")).toBe(false);
      expect(isValidTimelineDate(' '.repeat(3))).toBe(false);
      expect(isValidTimelineDate("unknown")).toBe(false);
      expect(isValidTimelineDate("undated")).toBe(false);
      expect(isValidTimelineDate("invalid-date-format")).toBe(false);
      expect(isValidTimelineDate(undefined)).toBe(false);
      expect(isValidTimelineDate(null)).toBe(false);
    });

    it("formatTimelineDate formats ISO dates, keeps year-only dates as-is, and falls back for unknown", () => {
      expect(formatTimelineDate("1776")).toBe("1776");
      expect(formatTimelineDate("2024-04-12")).toBe("Apr 12, 2024");
      expect(formatTimelineDate("unknown")).toBe("Date unknown");
      expect(formatTimelineDate(null)).toBe("Date unknown");
      expect(formatTimelineDate("invalid", undefined, "Custom Fallback")).toBe("Custom Fallback");
    });

    it("sortTimelineEvents handles mixed dated and undated events correctly", () => {
      const items = [
        { id: "1", date: "unknown" },
        { id: "2", date: "2024-01-01" },
        { id: "3", date: "1800" },
        { id: "4", date: undefined },
        { id: "5", date: "2020-06-15" },
      ];

      const sorted = sortTimelineEvents(items);
      expect(sorted.map((item) => item.id)).toEqual(["3", "5", "2", "1", "4"]);
    });

    it("orders year-only dates below 100 before later centuries", () => {
      const sorted = sortTimelineEvents([
        { id: "1900", date: "1900-01-01" },
        { id: "50", date: "50" },
      ]);

      expect(sorted.map((item) => item.id)).toEqual(["50", "1900"]);
    });
  });
});
