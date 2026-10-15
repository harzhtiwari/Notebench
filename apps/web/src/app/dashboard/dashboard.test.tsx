// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { NotebookSummary, DashboardMetrics } from "@notebook/contracts";

import { DashboardView } from "./dashboard-view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
});

function makeSummary(overrides: Partial<NotebookSummary> & { id: string }): NotebookSummary {
  return {
    userId: "user-1",
    title: "Untitled",
    trashedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    sourcesCount: 0,
    artifactsCount: 0,
    storageBytes: 0,
    sourceFileNames: [],
    ...overrides,
  };
}

const SAMPLE: NotebookSummary[] = [
  makeSummary({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Quantum Computing Basics",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-10T15:00:00.000Z",
    sourcesCount: 2,
    artifactsCount: 1,
    storageBytes: 2048000,
    sourceFileNames: ["Shor_Algorithm.pdf", "Notes.txt"],
  }),
  makeSummary({
    id: "22222222-2222-4222-8222-222222222222",
    title: "Biochemistry Digest",
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-11T12:00:00.000Z",
    sourcesCount: 4,
    artifactsCount: 3,
    storageBytes: 8192000,
    sourceFileNames: ["EnzymeKinetics.pdf", "Proteins.docx"],
  }),
];

const METRICS: DashboardMetrics = {
  storageUsedBytes: 10240000,
  storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
  notebookCount: 2,
  sourceCount: 6,
  artifactCount: 4,
};

describe("dashboard view (ticket 05)", () => {
  it("first run shows the centred welcome card with [+ Create Notebook] and no sample rows", () => {
    const onCreate = vi.fn();
    render(
      <DashboardView notebooks={[]} hasConfiguredModel metrics={METRICS} onCreateNotebook={onCreate} />
    );
    expect(screen.getByText("Welcome to Notebench")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "+ Create Notebook" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("grid view fixes the create card in slot 1 and opens notebooks on click", () => {
    const onOpen = vi.fn();
    const onCreate = vi.fn();
    render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        onOpenNotebook={onOpen}
        onCreateNotebook={onCreate}
      />
    );
    const grid = screen.getByTestId("dashboard-grid");
    const first = grid.firstElementChild;
    expect(first?.textContent).toContain("Create New Notebook");
    fireEvent.click(within(grid as HTMLElement).getByText("Quantum Computing Basics"));
    expect(onOpen).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    fireEvent.click(screen.getByText("+ Create New Notebook"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("list view renders the 7 config columns and opens the notebook on row click", () => {
    const onOpen = vi.fn();
    render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
        onOpenNotebook={onOpen}
      />
    );
    const table = screen.getByRole("table");
    const headers = within(table as HTMLElement)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["", "Title", "Sources", "Artifacts", "Storage", "Last Updated", ""]);
    fireEvent.click(within(table as HTMLElement).getByText("Biochemistry Digest"));
    expect(onOpen).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });

  it("rename saves on Enter and on blur; Escape and empty values do not save", async () => {
    const onRename = vi.fn();
    const { rerender } = render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
        onRenameNotebook={onRename}
      />
    );

    // Open the actions menu and choose Rename. Radix menu triggers toggle on
    // pointerdown (see @radix-ui/react-dropdown-menu), not click.
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-11111111-1111-4111-8111-111111111111"),
      { button: 0 }
    );
    const renameItem = await screen.findByTestId(
      "action-rename-11111111-1111-4111-8111-111111111111"
    );
    fireEvent.click(renameItem);
    const input = screen.getByTestId(
      "inline-rename-input-11111111-1111-4111-8111-111111111111"
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Quantum Revised" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "Quantum Revised");

    // Blur saves a changed non-empty title.
    rerender(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
        onRenameNotebook={onRename}
      />
    );
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-11111111-1111-4111-8111-111111111111"),
      { button: 0 }
    );
    fireEvent.click(
      await screen.findByTestId("action-rename-11111111-1111-4111-8111-111111111111")
    );
    const blurInput = screen.getByTestId(
      "inline-rename-input-11111111-1111-4111-8111-111111111111"
    ) as HTMLInputElement;
    fireEvent.change(blurInput, { target: { value: "Quantum Blurred" } });
    fireEvent.blur(blurInput);
    expect(onRename).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "Quantum Blurred");

    // Escape reverts without saving.
    rerender(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
        onRenameNotebook={onRename}
      />
    );
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-22222222-2222-4222-8222-222222222222"),
      { button: 0 }
    );
    const renameItem2 = await screen.findByTestId(
      "action-rename-22222222-2222-4222-8222-222222222222"
    );
    fireEvent.click(renameItem2);
    const input2 = screen.getByTestId(
      "inline-rename-input-22222222-2222-4222-8222-222222222222"
    ) as HTMLInputElement;
    fireEvent.change(input2, { target: { value: "Discarded Name" } });
    fireEvent.keyDown(input2, { key: "Escape" });
    expect(onRename).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("inline-rename-input-22222222-2222-4222-8222-222222222222")).toBeNull();

    // Empty value reverts without saving.
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-22222222-2222-4222-8222-222222222222"),
      { button: 0 }
    );
    const renameItem3 = await screen.findByTestId(
      "action-rename-22222222-2222-4222-8222-222222222222"
    );
    fireEvent.click(renameItem3);
    const input3 = screen.getByTestId(
      "inline-rename-input-22222222-2222-4222-8222-222222222222"
    ) as HTMLInputElement;
    fireEvent.change(input3, { target: { value: "   " } });
    fireEvent.blur(input3);
    expect(onRename).toHaveBeenCalledTimes(2);
  });

  it("filter matches a title and a source filename; zero results show the empty state with [Clear search]", () => {
    render(
      <DashboardView notebooks={SAMPLE} hasConfiguredModel metrics={METRICS} />
    );
    const search = screen.getByLabelText("Search notebooks");
    fireEvent.change(search, { target: { value: "quantum" } });
    expect(screen.queryByText("Biochemistry Digest")).toBeNull();
    expect(screen.getByText("Quantum Computing Basics")).toBeDefined();

    fireEvent.change(search, { target: { value: "EnzymeKinetics" } });
    expect(screen.getByText("Biochemistry Digest")).toBeDefined();

    fireEvent.change(search, { target: { value: "no-such-thing" } });
    expect(screen.getByText("No notebooks match 'no-such-thing'")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Quantum Computing Basics")).toBeDefined();
    expect(screen.getByText("Biochemistry Digest")).toBeDefined();
  });

  it("sort orders correctly for each key", () => {
    render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
      />
    );
    const titles = (): Array<string> =>
      screen
        .getAllByTestId(/^notebook-row-/)
        .map(
          (row) =>
            within(row as HTMLElement).getAllByRole("cell")[1]?.textContent ?? ""
        );

    const sort = screen.getByLabelText("Sort notebooks") as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: "title" } });
    expect(titles()).toEqual(["Biochemistry Digest", "Quantum Computing Basics"]);
    fireEvent.change(sort, { target: { value: "size" } });
    expect(titles()).toEqual(["Biochemistry Digest", "Quantum Computing Basics"]);
    fireEvent.change(sort, { target: { value: "created" } });
    expect(titles()).toEqual(["Biochemistry Digest", "Quantum Computing Basics"]);
    fireEvent.change(sort, { target: { value: "updated" } });
    expect(titles()).toEqual(["Biochemistry Digest", "Quantum Computing Basics"]);
  });

  it("banner shows only when no chat model is set", () => {
    const { rerender } = render(
      <DashboardView notebooks={SAMPLE} hasConfiguredModel={false} metrics={METRICS} />
    );
    expect(screen.getByTestId("no-model-banner")).toBeDefined();
    rerender(
      <DashboardView notebooks={SAMPLE} hasConfiguredModel metrics={METRICS} />
    );
    expect(screen.queryByTestId("no-model-banner")).toBeNull();
  });

  it("grid/list choice persists in localStorage and survives reload", () => {
    window.localStorage.setItem("notebench:dashboard:view", "list");
    const { unmount } = render(
      <DashboardView notebooks={SAMPLE} hasConfiguredModel metrics={METRICS} />
    );
    expect(screen.getByRole("table")).toBeDefined();
    unmount();

    window.localStorage.setItem("notebench:dashboard:view", "grid");
    render(<DashboardView notebooks={SAMPLE} hasConfiguredModel metrics={METRICS} />);
    expect(screen.getByTestId("dashboard-grid")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(window.localStorage.getItem("notebench:dashboard:view")).toBe("list");
  });

  it("metrics popover reports the safe cap and counts; storage summary links to Storage & Data", async () => {
    const onOpenSettings = vi.fn();
    render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        onOpenSettings={onOpenSettings}
      />
    );
    expect(screen.getByTestId("storage-summary")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Storage & Data" }));
    expect(onOpenSettings).toHaveBeenCalledWith("storage");

    fireEvent.click(screen.getByRole("button", { name: "Instance Metrics" }));
    expect(await screen.findByText("Total Notebooks")).toBeDefined();
    expect(screen.getByText("2 Active")).toBeDefined();
  });

  it("actions menu offers Rename, Duplicate, Export ZIP, Delete and wires duplicate/delete", async () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onExportZip = vi.fn();
    render(
      <DashboardView
        notebooks={SAMPLE}
        hasConfiguredModel
        metrics={METRICS}
        defaultView="list"
        onDuplicateNotebook={onDuplicate}
        onDeleteNotebook={onDelete}
        onExportZip={onExportZip}
      />
    );
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-11111111-1111-4111-8111-111111111111"),
      { button: 0 }
    );
    fireEvent.click(
      await screen.findByTestId("action-duplicate-11111111-1111-4111-8111-111111111111")
    );
    expect(onDuplicate).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-11111111-1111-4111-8111-111111111111"),
      { button: 0 }
    );
    fireEvent.click(
      await screen.findByTestId("action-export-11111111-1111-4111-8111-111111111111")
    );
    expect(onExportZip).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    fireEvent.pointerDown(
      screen.getByTestId("actions-trigger-11111111-1111-4111-8111-111111111111"),
      { button: 0 }
    );
    fireEvent.click(
      await screen.findByTestId("action-delete-11111111-1111-4111-8111-111111111111")
    );
    expect(onDelete).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });
});
