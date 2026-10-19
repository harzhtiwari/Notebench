// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ToolTile,
  RoadmapGrid,
  GenerationModal,
  ArtifactListRow,
  STUDIO_TOOL_CATALOG,
  getActiveTools,
  getRoadmapTools,
} from "./index.js";

afterEach(() => {
  cleanup();
});

function getTool(id: string) {
  const tool = STUDIO_TOOL_CATALOG.find((t) => t.id === id);
  if (tool === undefined) {
    throw new Error(`Tool '${id}' missing from STUDIO_TOOL_CATALOG`);
  }
  return tool;
}

describe("studio catalog patterns (ticket 14)", () => {
  describe("STUDIO_TOOL_CATALOG", () => {
    it("defines exactly ten tools: five active and five roadmap", () => {
      expect(STUDIO_TOOL_CATALOG).toBeDefined();
      expect(STUDIO_TOOL_CATALOG.length).toBe(10);

      const active = getActiveTools();
      const roadmap = getRoadmapTools();

      expect(active.length).toBe(5);
      expect(roadmap.length).toBe(5);

      const activeLabels = active.map((t) => t.label);
      expect(activeLabels).toContain("Report");
      expect(activeLabels).toContain("Study Guide");
      expect(activeLabels).toContain("FAQ");
      expect(activeLabels).toContain("Flashcards");
      expect(activeLabels).toContain("Quiz");

      const roadmapLabels = roadmap.map((t) => t.label);
      expect(roadmapLabels).toContain("Audio Overview");
      expect(roadmapLabels).toContain("Slide Deck");
      expect(roadmapLabels).toContain("Video Overview");
      expect(roadmapLabels).toContain("Mind Map");
      expect(roadmapLabels).toContain("Data Table");
    });
  });

  describe("ToolTile", () => {
    it("renders an active tool enabled and triggers onSelect/onClick", () => {
      const onSelect = vi.fn();
      const reportTool = getTool("report");

      render(<ToolTile tool={reportTool} onSelect={onSelect} />);

      const button = screen.getByRole("button", { name: /Report/ });
      expect(button).toBeDefined();
      expect(button).not.toHaveProperty("disabled", true);
      fireEvent.click(button);
      expect(onSelect).toHaveBeenCalledWith(reportTool);
    });

    it("renders a roadmap tool disabled with version badge", () => {
      const deckTool = getTool("deck");

      render(<ToolTile tool={deckTool} />);

      const button = screen.getByRole("button", { name: /Slide Deck/ });
      expect(button).toBeDefined();
      expect(button).toHaveProperty("disabled", true);
      expect(screen.getByText(/Coming in 0\.2/)).toBeDefined();
    });
  });

  describe("RoadmapGrid", () => {
    it("renders all five roadmap items in disabled state with badges", () => {
      render(<RoadmapGrid />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(5);
      for (const btn of buttons) {
        expect(btn).toHaveProperty("disabled", true);
      }

      expect(screen.getByText("Audio Overview")).toBeDefined();
      expect(screen.getByText("Slide Deck")).toBeDefined();
      expect(screen.getByText("Video Overview")).toBeDefined();
      expect(screen.getByText("Mind Map")).toBeDefined();
      expect(screen.getByText("Data Table")).toBeDefined();
    });
  });

  describe("GenerationModal", () => {
    const reportTool = getTool("report");

    it("warns and disables Generate when zero sources are selected", () => {
      const onGenerate = vi.fn();
      render(
        <GenerationModal
          open
          onOpenChange={() => {}}
          tool={reportTool}
          selectedSources={[]}
          onGenerate={onGenerate}
        />
      );

      expect(screen.getByRole("dialog", { name: /Generate Report/ })).toBeDefined();
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText(/Select at least one source/)).toBeDefined();

      const generateBtn = screen.getByRole("button", { name: "Generate" });
      expect(generateBtn).toHaveProperty("disabled", true);
      fireEvent.click(generateBtn);
      expect(onGenerate).not.toHaveBeenCalled();
    });

    it("summarizes sources and enables Generate when sources exist", () => {
      const onGenerate = vi.fn();
      const sources = [
        { id: "s1", title: "Grid study 2024.pdf" },
        { id: "s2", title: "Market Outlook.docx" },
      ];

      render(
        <GenerationModal
          open
          onOpenChange={() => {}}
          tool={reportTool}
          selectedSources={sources}
          onGenerate={onGenerate}
        />
      );

      expect(screen.getByText(/2 selected sources/i)).toBeDefined();
      expect(screen.getByText("Grid study 2024.pdf")).toBeDefined();
      expect(screen.getByText("Market Outlook.docx")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();

      const generateBtn = screen.getByRole("button", { name: "Generate" });
      expect(generateBtn).not.toHaveProperty("disabled", true);
      fireEvent.click(generateBtn);
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe("ArtifactListRow", () => {
    it("renders title, type badge, relative time, and live status (icon + label)", () => {
      const onOpen = vi.fn();
      const updatedTime = new Date(Date.now() - 3_600_000).toISOString();

      const { rerender } = render(
        <ArtifactListRow
          id="art-1"
          title="Renewable Energy Executive Brief"
          type="report"
          updatedAt={updatedTime}
          status="generating"
          onOpen={onOpen}
        />
      );

      expect(screen.getByText("Renewable Energy Executive Brief")).toBeDefined();
      expect(screen.getByText("Report")).toBeDefined();
      expect(screen.getByText("1h ago")).toBeDefined();

      // Check status: never color alone! Icon + text must be present.
      const statusEl = screen.getByRole("status");
      expect(statusEl.textContent).toContain("Generating...");
      expect(statusEl.querySelector("svg")).not.toBeNull();

      // Test click opens artifact
      fireEvent.click(screen.getByText("Renewable Energy Executive Brief"));
      expect(onOpen).toHaveBeenCalledWith("art-1");

      // Test status transitions: ready
      rerender(
        <ArtifactListRow
          id="art-1"
          title="Renewable Energy Executive Brief"
          type="report"
          updatedAt={updatedTime}
          status="ready"
          onOpen={onOpen}
        />
      );
      const readyStatus = screen.getByRole("status");
      expect(readyStatus.textContent).toContain("Ready");
      expect(readyStatus.querySelector("svg")).not.toBeNull();

      // Test status transitions: failed
      rerender(
        <ArtifactListRow
          id="art-1"
          title="Renewable Energy Executive Brief"
          type="report"
          updatedAt={updatedTime}
          status="failed"
          onOpen={onOpen}
        />
      );
      const failedStatus = screen.getByRole("status");
      expect(failedStatus.textContent).toContain("Failed");
      expect(failedStatus.querySelector("svg")).not.toBeNull();

      // Test status transitions: stale
      rerender(
        <ArtifactListRow
          id="art-1"
          title="Renewable Energy Executive Brief"
          type="report"
          updatedAt={updatedTime}
          status="stale"
          onOpen={onOpen}
        />
      );
      const staleStatus = screen.getByRole("status");
      expect(staleStatus.textContent).toContain("Source changed");
      expect(staleStatus.querySelector("svg")).not.toBeNull();
    });
  });
});
