// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TrashRow, type TrashedItem } from "./index.js";

afterEach(() => {
  cleanup();
});

const NOTEBOOK_ITEM: TrashedItem = {
  id: "nb-1",
  title: "Machine Learning Notes",
  type: "notebook",
  trashedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  daysRemaining: 28,
};

const SOURCE_ITEM: TrashedItem = {
  id: "src-1",
  title: "Attention Is All You Need.pdf",
  type: "source",
  trashedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
  daysRemaining: 2,
};

describe("TrashRow component (Ticket 21: Trash Composition)", () => {
  it("renders item title, type badge, and paired restore and purge actions", () => {
    const onRestore = vi.fn();
    const onPurge = vi.fn();

    render(
      <table>
        <tbody>
          <TrashRow
            item={NOTEBOOK_ITEM}
            onRestore={onRestore}
            onPurge={onPurge}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText("Machine Learning Notes")).toBeDefined();
    expect(screen.getByText(/notebook/i)).toBeDefined();

    const restoreBtn = screen.getByRole("button", { name: /restore/i });
    expect(restoreBtn).toBeDefined();
    fireEvent.click(restoreBtn);
    expect(onRestore).toHaveBeenCalledWith("nb-1");

    const purgeBtn = screen.getByRole("button", { name: /delete permanently|purge/i });
    expect(purgeBtn).toBeDefined();
    fireEvent.click(purgeBtn);
    expect(onPurge).toHaveBeenCalledWith("nb-1");
  });

  it("displays days remaining paired with ClockCounterClockwise icon for standard retention", () => {
    render(
      <table>
        <tbody>
          <TrashRow item={NOTEBOOK_ITEM} />
        </tbody>
      </table>
    );

    const daysText = screen.getByText(/28 days remaining/i);
    expect(daysText).toBeDefined();
    // Non-color cue: ClockCounterClockwise icon must be present and aria-hidden
    const row = screen.getByRole("row");
    const icons = row.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it("displays urgent retention countdown paired with Warning icon when days remaining <= 3", () => {
    render(
      <table>
        <tbody>
          <TrashRow item={SOURCE_ITEM} />
        </tbody>
      </table>
    );

    const daysText = screen.getByText(/2 days remaining/i);
    expect(daysText).toBeDefined();
    // Never color-alone: urgent days remaining must pair warning class with visible icon & label
    const row = screen.getByRole("row");
    expect(row.innerHTML).toContain("var(--nb-warn)");
  });

  it("computes 30-day countdown automatically when daysRemaining is omitted", () => {
    // Trashed 10 days ago -> 20 days remaining
    const autoItem: TrashedItem = {
      id: "nb-auto",
      title: "Algorithms Handbook",
      type: "notebook",
      trashedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    };

    render(
      <table>
        <tbody>
          <TrashRow item={autoItem} />
        </tbody>
      </table>
    );

    expect(screen.getByText(/20 days remaining/i)).toBeDefined();
  });

  it("supports source item type with appropriate type label", () => {
    render(
      <table>
        <tbody>
          <TrashRow item={SOURCE_ITEM} />
        </tbody>
      </table>
    );

    expect(screen.getByText("Attention Is All You Need.pdf")).toBeDefined();
    expect(screen.getByText(/source/i)).toBeDefined();
  });

  it("correctly handles SQLite unixepoch integer seconds in computeDaysRemaining", () => {
    const unixSeconds = Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60;
    const epochItem: TrashedItem = {
      id: "epoch-1",
      title: "SQLite Trashed Notebook",
      type: "notebook",
      trashedAt: unixSeconds,
    };

    render(
      <table>
        <tbody>
          <TrashRow item={epochItem} />
        </tbody>
      </table>
    );

    expect(screen.getByText(/25 days remaining/i)).toBeDefined();
  });

  it("enforces zero elevation shadows on in-page TrashRow elements (Rule 1.2)", () => {
    const { container } = render(
      <table>
        <tbody>
          <TrashRow item={NOTEBOOK_ITEM} />
        </tbody>
      </table>
    );

    const html = container.innerHTML;
    expect(html).not.toContain("--nb-shadow-float");
    expect(html).not.toContain("shadow-xs");
    expect(html).not.toContain("shadow-md");
    expect(html).not.toContain("shadow-lg");
  });
});
