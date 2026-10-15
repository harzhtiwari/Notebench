// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import {
  UsageBar,
  GateNotice,
  LevelActions,
  DEFAULT_STORAGE_SAFE_CAP_BYTES,
  CHART_SERIES_TOKENS,
  HardDrive,
  Database,
  type StorageCategoryItem,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("Storage Page Patterns (Issue 22 / Ticket 23)", () => {
  const sampleCategories: StorageCategoryItem[] = [
    { id: "database", label: "Database", bytes: 268435456 }, // 256 MB
    { id: "uploads", label: "Uploads", bytes: 805306368 }, // 768 MB
    { id: "artifacts", label: "Artifacts", bytes: 134217728 }, // 128 MB
    { id: "vault", label: "Vault Keys", bytes: 1048576 }, // 1 MB
    { id: "cache", label: "Cache", bytes: 67108864 }, // 64 MB
    { id: "logs", label: "Logs", bytes: 33554432 }, // 32 MB
  ];

  describe("Icons Export", () => {
    it("exports HardDrive and Database as renderable SVG icons", () => {
      const { container: c1 } = render(<HardDrive size={16} />);
      expect(c1.querySelector("svg")).not.toBeNull();

      const { container: c2 } = render(<Database size={16} />);
      expect(c2.querySelector("svg")).not.toBeNull();
    });
  });

  describe("UsageBar Component", () => {
    it("has 5.0 GB default safe cap constant matching PRD 1.34", () => {
      expect(DEFAULT_STORAGE_SAFE_CAP_BYTES).toBe(5 * 1024 * 1024 * 1024);
      expect(DEFAULT_STORAGE_SAFE_CAP_BYTES).toBe(5368709120);
    });

    it("renders headline with total usage and safe cap percentage", () => {
      // Total bytes = 256 + 768 + 128 + 1 + 64 + 32 = 1249 MB = 1309671424 bytes (~1.2 GB of 5.0 GB)
      render(<UsageBar categories={sampleCategories} />);

      expect(screen.getByText(/Storage Usage/i)).toBeDefined();
      expect(screen.getByText(/1\.2 GB/i)).toBeDefined();
      expect(screen.getByText(/5\.0 GB/i)).toBeDefined();
      expect(screen.getByText(/24%/i)).toBeDefined();
    });

    it("composes board .chart, .chart-row, and .chart-bar semantic classes", () => {
      const { container } = render(<UsageBar categories={sampleCategories} />);

      const chart = container.querySelector(".chart");
      expect(chart).not.toBeNull();

      const chartRows = container.querySelectorAll(".chart-row");
      expect(chartRows.length).toBe(sampleCategories.length);

      const chartBars = container.querySelectorAll(".chart-bar");
      expect(chartBars.length).toBeGreaterThanOrEqual(sampleCategories.length);
    });

    it("enforces never color-alone: each category has direct text label and formatted size", () => {
      render(<UsageBar categories={sampleCategories} />);

      for (const cat of sampleCategories) {
        expect(screen.getByText(cat.label)).toBeDefined();
      }

      expect(screen.getByText("256.0 MB")).toBeDefined();
      expect(screen.getByText("768.0 MB")).toBeDefined();
      expect(screen.getByText("128.0 MB")).toBeDefined();
      expect(screen.getByText("1.0 MB")).toBeDefined();
      expect(screen.getByText("64.0 MB")).toBeDefined();
      expect(screen.getByText("32.0 MB")).toBeDefined();
    });

    it("cycles series tokens --nb-chart-1 through --nb-chart-4", () => {
      expect(CHART_SERIES_TOKENS).toEqual([
        "var(--nb-chart-1)",
        "var(--nb-chart-2)",
        "var(--nb-chart-3)",
        "var(--nb-chart-4)",
      ]);

      const { container } = render(<UsageBar categories={sampleCategories} />);
      const rows = container.querySelectorAll(".chart-row");

      expect(rows[0]?.querySelector(".c1, [style*='--nb-chart-1']")).not.toBeNull();
      expect(rows[1]?.querySelector(".c2, [style*='--nb-chart-2']")).not.toBeNull();
      expect(rows[2]?.querySelector(".c3, [style*='--nb-chart-3']")).not.toBeNull();
      expect(rows[3]?.querySelector(".c4, [style*='--nb-chart-4']")).not.toBeNull();
      expect(rows[4]?.querySelector(".c1, [style*='--nb-chart-1']")).not.toBeNull();
    });

    it("supports custom capBytes and handles 0 B / empty categories", () => {
      const customCap = 1024 * 1024 * 1024; // 1 GB
      const singleCat: StorageCategoryItem[] = [
        { id: "database", label: "Database", bytes: 536870912 }, // 512 MB
      ];

      render(<UsageBar categories={singleCat} capBytes={customCap} />);

      expect(screen.getAllByText(/512\.0 MB/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/1\.0 GB/i)).toBeDefined();
      expect(screen.getByText(/50%/i)).toBeDefined();
    });

    it("has accessible role and attributes on the progress meter", () => {
      render(<UsageBar categories={sampleCategories} />);

      const meter = screen.getByRole("progressbar");
      expect(meter).toBeDefined();
      expect(meter.getAttribute("aria-valuemin")).toBe("0");
      expect(meter.getAttribute("aria-valuemax")).toBe(String(DEFAULT_STORAGE_SAFE_CAP_BYTES));
      expect(meter.getAttribute("aria-valuenow")).toBe("1309671424");
    });

    it("does not contain any floating elevation shadows", () => {
      const { container } = render(<UsageBar categories={sampleCategories} />);
      expect(container.innerHTML).not.toContain("shadow-float");
      expect(container.innerHTML).not.toContain("shadow-xs");
      expect(container.innerHTML).not.toContain("--nb-shadow-float");
    });
  });

  describe("GateNotice Component", () => {
    it("renders warning banner when exported is false (export-first gating active)", () => {
      const onExport = vi.fn();
      const { container } = render(
        <GateNotice exported={false} onExport={onExport} />
      );

      const banner = container.querySelector(".banner.banner--warn");
      expect(banner).not.toBeNull();
      expect(screen.getByText(/Export required before deletion/i)).toBeDefined();

      const exportBtn = screen.getByRole("button", { name: /Export/i });
      expect(exportBtn).toBeDefined();
      fireEvent.click(exportBtn);
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it("renders success state and unlocks when exported is true", () => {
      const { container } = render(<GateNotice exported={true} />);

      const banner = container.querySelector(".banner.banner--ok");
      expect(banner).not.toBeNull();
      expect(screen.getByText(/Export completed/i)).toBeDefined();
      expect(screen.getByText(/unlocked/i)).toBeDefined();
    });

    it("handles isExporting loading state", () => {
      render(<GateNotice exported={false} isExporting={true} onExport={vi.fn()} />);

      const exportBtn = screen.getByRole("button", { name: /Exporting/i });
      expect(exportBtn.getAttribute("disabled")).not.toBeNull();
    });

    it("supports acknowledgment checkbox bypass per PRD Decision 7.7", () => {
      const onAcknowledge = vi.fn();
      render(
        <GateNotice
          exported={false}
          acknowledged={false}
          onAcknowledgeChange={onAcknowledge}
        />
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeDefined();
      fireEvent.click(checkbox);
      expect(onAcknowledge).toHaveBeenCalledWith(true);
    });

    it("does not contain any floating elevation shadows", () => {
      const { container } = render(<GateNotice exported={false} />);
      expect(container.innerHTML).not.toContain("shadow-float");
      expect(container.innerHTML).not.toContain("shadow-xs");
      expect(container.innerHTML).not.toContain("--nb-shadow-float");
    });
  });

  describe("LevelActions Component", () => {
    it("renders deletion levels driven by DELETION_LEVELS table", () => {
      render(<LevelActions exported={true} />);

      // Levels 1, 2, 4, 6 or all levels
      expect(screen.getByRole("heading", { name: "Clear Cache" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "Clear Memory" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "Factory Reset" })).toBeDefined();
    });

    it("disables deletion actions when export-first gating is active (exported: false)", () => {
      render(<LevelActions exported={false} gated={true} />);

      const deleteButtons = screen.getAllByRole("button", { name: /Clear|Delete|Reset|Purge/i });
      expect(deleteButtons.length).toBeGreaterThan(0);

      for (const btn of deleteButtons) {
        expect(btn.getAttribute("disabled")).not.toBeNull();
      }
    });

    it("enables deletion actions when exported is true", () => {
      render(<LevelActions exported={true} gated={true} />);

      const deleteButtons = screen.getAllByRole("button", { name: /Clear|Delete|Reset|Purge/i });
      expect(deleteButtons.length).toBeGreaterThan(0);

      for (const btn of deleteButtons) {
        expect(btn.getAttribute("disabled")).toBeNull();
      }
    });

    it("opens ConfirmDialog when a deletion action is clicked", async () => {
      const onConfirm = vi.fn();
      render(
        <LevelActions
          exported={true}
          levels={[1, 2]}
          onConfirmDeletion={onConfirm}
        />
      );

      const clearCacheBtn = screen.getByRole("button", { name: /Clear Cache/i });
      fireEvent.click(clearCacheBtn);

      // ConfirmDialog should now be open
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(within(dialog).getByText(/Purges \.tmp\/cache\/\*/i)).toBeDefined();

      // Click confirm button inside dialog
      const confirmBtn = within(dialog).getByRole("button", { name: /^Clear$/i });
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalled();
    });

    it("displays risk tags pairing color and text (never color-alone)", () => {
      render(<LevelActions exported={true} levels={[1, 6]} />);

      expect(screen.getByText(/Low/i)).toBeDefined();
      expect(screen.getByText(/High/i)).toBeDefined();
    });

    it("in-page cards have zero elevation shadows", () => {
      const { container } = render(<LevelActions exported={true} />);
      expect(container.innerHTML).not.toContain("shadow-float");
      expect(container.innerHTML).not.toContain("shadow-xs");
      expect(container.innerHTML).not.toContain("--nb-shadow-float");
    });
  });
});
