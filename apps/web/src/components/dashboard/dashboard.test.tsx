// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardView } from "./DashboardView";
import type { NotebookSummary, DashboardMetrics } from "@notebook/contracts";

describe("DashboardView Component (Ticket 05)", () => {
  const sampleNotebooks: NotebookSummary[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      title: "Quantum Physics",
      trashedAt: null,
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-10T15:00:00.000Z",
      sourcesCount: 3,
      artifactsCount: 2,
      storageBytes: 1500000,
      sourceFileNames: ["qubits.pdf", "teleportation.md"],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
      title: "Biochemistry",
      trashedAt: null,
      createdAt: "2026-10-05T08:00:00.000Z",
      updatedAt: "2026-10-11T12:00:00.000Z",
      sourcesCount: 5,
      artifactsCount: 4,
      storageBytes: 4500000,
      sourceFileNames: ["enzymes.docx", "proteins.pdf"],
    },
  ];

  const sampleMetrics: DashboardMetrics = {
    storageUsedBytes: 6000000,
    storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
    notebookCount: 2,
    sourceCount: 8,
    artifactCount: 6,
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("First-Run Blank State (Decision 1.36, B10)", () => {
    it("renders centered welcome card and [+ Create Notebook] when 0 notebooks exist without mock data", () => {
      const onCreate = vi.fn();
      render(
        <DashboardView
          notebooks={[]}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          onCreateNotebook={onCreate}
        />
      );

      expect(screen.getByText(/welcome to notebench/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /\+ create notebook/i })).toBeDefined();

      // Click create triggers handler
      fireEvent.click(screen.getByRole("button", { name: /\+ create notebook/i }));
      expect(onCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("Grid View & Slot 1 Create Card (Decision 1.26)", () => {
    it("renders dashed '+ Create New Notebook' card fixed in Slot 1", () => {
      const onCreate = vi.fn();
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          onCreateNotebook={onCreate}
          defaultView="grid"
        />
      );

      const createCard = screen.getByTestId("slot1-create-notebook-card");
      expect(createCard).toBeDefined();
      expect(createCard.textContent).toContain("Create New Notebook");

      fireEvent.click(createCard);
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it("renders notebook cards in grid", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="grid"
        />
      );

      expect(screen.getByText("Quantum Physics")).toBeDefined();
      expect(screen.getByText("Biochemistry")).toBeDefined();
    });
  });

  describe("List View & 7 Columns (Decision 1.25)", () => {
    it("renders exactly 7 columns in list view table", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
        />
      );

      const table = screen.getByRole("table");
      expect(table).toBeDefined();

      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(7);
      expect(headers.map((h) => h.textContent?.trim())).toEqual([
        "",
        "Title",
        "Sources",
        "Artifacts",
        "Storage",
        "Last Updated",
        "",
      ]);
    });

    it("clicking a row opens the notebook", () => {
      const onOpen = vi.fn();
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
          onOpenNotebook={onOpen}
        />
      );

      const row = screen.getByTestId(`notebook-row-${sampleNotebooks[0]?.id}`);
      fireEvent.click(row);
      expect(onOpen).toHaveBeenCalledWith(sampleNotebooks[0]?.id);
    });
  });

  describe("View Mode Persistence in localStorage (Decision 1.25)", () => {
    it("persists view choice across reload", () => {
      const { unmount } = render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
        />
      );

      // Toggle to list view
      const listViewBtn = screen.getByTestId("view-toggle-list");
      fireEvent.click(listViewBtn);

      expect(window.localStorage.getItem("notebench:dashboard:view")).toBe("list");
      unmount();

      // Mount again, should read list view from localStorage
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
        />
      );

      expect(screen.getByRole("table")).toBeDefined();
    });
  });

  describe("Inline Rename (Decision 1.18)", () => {
    it("saves rename on Enter key press", async () => {
      const onRename = vi.fn().mockResolvedValue(undefined);
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
          onRenameNotebook={onRename}
        />
      );

      // Trigger inline rename mode
      const renameTrigger = screen.getByTestId(`rename-trigger-${sampleNotebooks[0]?.id}`);
      fireEvent.click(renameTrigger);

      const input = screen.getByTestId(`inline-rename-input-${sampleNotebooks[0]?.id}`) as HTMLInputElement;
      expect(input).toBeDefined();

      fireEvent.change(input, { target: { value: "Advanced Quantum" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(onRename).toHaveBeenCalledWith(sampleNotebooks[0]?.id, "Advanced Quantum");
      });
    });

    it("saves rename on blur", async () => {
      const onRename = vi.fn().mockResolvedValue(undefined);
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
          onRenameNotebook={onRename}
        />
      );

      const renameTrigger = screen.getByTestId(`rename-trigger-${sampleNotebooks[0]?.id}`);
      fireEvent.click(renameTrigger);

      const input = screen.getByTestId(`inline-rename-input-${sampleNotebooks[0]?.id}`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Blur Saved Title" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(onRename).toHaveBeenCalledWith(sampleNotebooks[0]?.id, "Blur Saved Title");
      });
    });

    it("reverts without saving on Escape or empty string", () => {
      const onRename = vi.fn();
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
          onRenameNotebook={onRename}
        />
      );

      const renameTrigger = screen.getByTestId(`rename-trigger-${sampleNotebooks[0]?.id}`);
      fireEvent.click(renameTrigger);

      const input = screen.getByTestId(`inline-rename-input-${sampleNotebooks[0]?.id}`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Something Else" } });
      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByTestId(`inline-rename-input-${sampleNotebooks[0]?.id}`)).toBeNull();
    });
  });

  describe("Filter by Title and Ingested Source Filenames (Decision 1.35)", () => {
    it("filters notebooks matching source filename", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="grid"
        />
      );

      const searchInput = screen.getByPlaceholderText(/search notebooks or source files/i);
      fireEvent.change(searchInput, { target: { value: "enzymes.docx" } });

      expect(screen.queryByText("Quantum Physics")).toBeNull();
      expect(screen.getByText("Biochemistry")).toBeDefined();
    });

    it("shows zero-results state with [Clear search] button", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="grid"
        />
      );

      const searchInput = screen.getByPlaceholderText(/search notebooks or source files/i);
      fireEvent.change(searchInput, { target: { value: "NothingFound" } });

      expect(screen.getByText("No notebooks match 'NothingFound'")).toBeDefined();
      const clearBtn = screen.getByRole("button", { name: /clear search/i });
      expect(clearBtn).toBeDefined();

      fireEvent.click(clearBtn);
      expect(screen.getByText("Quantum Physics")).toBeDefined();
    });
  });

  describe("Sort by updated, created, title, size (PRD B7)", () => {
    it("sorts notebooks according to selected sort key", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          defaultView="list"
        />
      );

      const sortSelect = screen.getByTestId("sort-select") as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: "title" } });

      const rows = screen.getAllByTestId(/^notebook-row-/);
      expect(rows[0]?.textContent).toContain("Biochemistry");
      expect(rows[1]?.textContent).toContain("Quantum Physics");
    });
  });

  describe("Metrics Popover (Decision 1.34)", () => {
    it("displays storage used against 5.0 GB safe cap and counts", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
        />
      );

      const metricsTrigger = screen.getByTestId("metrics-popover-trigger");
      fireEvent.click(metricsTrigger);

      expect(screen.getByText(/5.0 GB safe cap/i)).toBeDefined();
      expect(screen.getByText(/2 active/i)).toBeDefined();
      expect(screen.getByText(/8 files/i)).toBeDefined();
      expect(screen.getByText(/6 trees/i)).toBeDefined();
      expect(screen.getByText(/manage storage & data/i)).toBeDefined();
    });
  });

  describe("No Model Configured Banner (PRD B8, Decision 1.9)", () => {
    it("shows banner when hasConfiguredModel is false", () => {
      const onOpenSettings = vi.fn();
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={false}
          onOpenSettings={onOpenSettings}
        />
      );

      const banner = screen.getByTestId("no-model-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("No model configured");

      const configureLink = screen.getByTestId("configure-model-btn");
      fireEvent.click(configureLink);
      expect(onOpenSettings).toHaveBeenCalledWith("models");
    });

    it("hides banner when hasConfiguredModel is true", () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
        />
      );

      expect(screen.queryByTestId("no-model-banner")).toBeNull();
    });
  });

  describe("Theme Selector & Settings Integration", () => {
    it("renders theme selector trigger and allows selecting light, dark, and system modes", async () => {
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
        />
      );

      const themeTrigger = screen.getByTestId("theme-selector-trigger");
      expect(themeTrigger).toBeDefined();

      // Open theme dropdown
      fireEvent.click(themeTrigger);

      // Select dark theme
      const darkOption = await screen.findByTestId("theme-option-dark");
      expect(darkOption).toBeDefined();
      fireEvent.click(darkOption);

      expect(localStorage.getItem("notebench_theme")).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      // Select light theme
      fireEvent.click(themeTrigger);
      const lightOption = screen.getByTestId("theme-option-light");
      fireEvent.click(lightOption);

      expect(localStorage.getItem("notebench_theme")).toBe("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");

      // Select system default theme
      fireEvent.click(themeTrigger);
      const systemOption = screen.getByTestId("theme-option-system");
      fireEvent.click(systemOption);

      expect(localStorage.getItem("notebench_theme")).toBe("system");
    });

    it("triggers onOpenSettings when settings button is clicked", () => {
      const onOpenSettings = vi.fn();
      render(
        <DashboardView
          notebooks={sampleNotebooks}
          metrics={sampleMetrics}
          hasConfiguredModel={true}
          onOpenSettings={onOpenSettings}
        />
      );

      const settingsBtn = screen.getByTestId("open-settings-btn");
      expect(settingsBtn).toBeDefined();

      fireEvent.click(settingsBtn);
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });
});

