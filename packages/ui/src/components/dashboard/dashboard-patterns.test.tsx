// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import type { NotebookSummary } from "@notebench/contracts";
import {
  SearchInput,
  SortSelect,
  ViewToggle,
  NotebookEmblem,
  NotebookMeta,
  NotebookCard,
  CreateCard,
  NotebookRow,
} from "./index.js";
import { MetricRow } from "../primitives/index.js";

afterEach(() => {
  cleanup();
});

const NOTEBOOK = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  title: "Grid study",
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
  sourcesCount: 3,
  artifactsCount: 2,
  storageBytes: 1536,
  sourceFileNames: ["grid.pdf"],
} as NotebookSummary;

describe("notebook dashboard patterns (ticket 07)", () => {
  it("SearchInput renders a labeled search field with board .search shape", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput aria-label="Search notebooks" onChange={onChange} />
    );
    const input = screen.getByLabelText("Search notebooks");
    expect(input.getAttribute("type")).toBe("search");
    expect(container.querySelector("svg")).not.toBeNull();
    fireEvent.change(input, { target: { value: "grid" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("SortSelect offers the dashboard sort keys and reports changes", () => {
    const onChange = vi.fn();
    render(
      <SortSelect aria-label="Sort notebooks" value="updated" onChange={onChange} />
    );
    const select = screen.getByLabelText<HTMLSelectElement>("Sort notebooks");
    expect(select.value).toBe("updated");
    expect(screen.getByRole("option", { name: "Title" })).toBeDefined();
    fireEvent.change(select, { target: { value: "title" } });
    expect(onChange).toHaveBeenCalledWith("title");
  });

  it("ViewToggle marks the active view pressed and switches", () => {
    const onChange = vi.fn();
    render(<ViewToggle value="grid" onChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "List view" }).getAttribute("aria-pressed")
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("NotebookEmblem renders the notebook icon, never an emoji", () => {
    const { container } = render(<NotebookEmblem />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("📓");
  });

  it("NotebookMeta shows counts, footprint, and relative update", () => {
    render(<NotebookMeta notebook={NOTEBOOK} />);
    expect(screen.getByText(/3 sources/)).toBeDefined();
    expect(screen.getByText(/2 artifacts/)).toBeDefined();
    expect(screen.getByText(/1.5 KB/)).toBeDefined();
    expect(screen.getByText(/1h ago/)).toBeDefined();
  });

  it("NotebookCard shows title and meta, opens on click, hosts actions", () => {
    const onOpen = vi.fn();
    render(
      <NotebookCard notebook={NOTEBOOK} onOpen={onOpen}>
        <button type="button">CardMenu</button>
      </NotebookCard>
    );
    expect(screen.getByText("Grid study")).toBeDefined();
    expect(screen.getByText(/3 sources/)).toBeDefined();
    expect(screen.getByRole("button", { name: "CardMenu" })).toBeDefined();
    fireEvent.click(screen.getByText("Grid study"));
    expect(onOpen).toHaveBeenCalledWith(NOTEBOOK.id);
  });

  it("CreateCard keeps the dashed Slot-1 copy and creates on click", () => {
    const onCreate = vi.fn();
    render(<CreateCard onCreate={onCreate} />);
    expect(screen.getByText("+ Create New Notebook")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Create New Notebook/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("NotebookRow renders all 7 columns with title action and actions slot", () => {
    const onOpen = vi.fn();
    render(
      <table>
        <tbody>
          <NotebookRow notebook={NOTEBOOK} onOpen={onOpen}>
            <button type="button">RowMenu</button>
          </NotebookRow>
        </tbody>
      </table>
    );
    const row = screen.getByRole("row");
    expect(row.querySelectorAll("td").length).toBe(7);
    fireEvent.click(screen.getByRole("button", { name: "Grid study" }));
    expect(onOpen).toHaveBeenCalledWith(NOTEBOOK.id);
    expect(screen.getByRole("button", { name: "RowMenu" })).toBeDefined();
  });

  it("MetricRow shows label, value, and a fraction bar", () => {
    const { container } = render(
      <MetricRow label="Storage Used" value="1.5 KB of 5.0 GB" fraction={0.5} />
    );
    expect(screen.getByText("Storage Used")).toBeDefined();
    expect(screen.getByText("1.5 KB of 5.0 GB")).toBeDefined();
    const bar = container.querySelector<HTMLElement>('[role="img"]');
    expect(bar?.getAttribute("aria-label")).toContain("50%");
  });
});
