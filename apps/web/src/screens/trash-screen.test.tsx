// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { TrashedItem } from "@notebook/ui";
import { TrashScreen } from "./trash-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MOCK_ITEMS: TrashedItem[] = [
  {
    id: "trash-nb-1",
    title: "Quantum Computing Foundations",
    type: "notebook",
    trashedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: 27,
  },
  {
    id: "trash-src-1",
    title: "Qiskit_Tutorial.pdf",
    type: "source",
    trashedAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: 1,
  },
];

describe("TrashScreen composition (Ticket 21: Trash Composition)", () => {
  it("renders empty state with retention alert banner and disabled empty button when trash is empty", async () => {
    render(<TrashScreen initialItems={[]} />);

    expect(screen.getByRole("heading", { name: "Trash" })).toBeDefined();

    // Alert banner for 30-day soft trash retention policy
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("30 days");

    // Empty list container
    expect(screen.getByText("Trash is empty")).toBeDefined();

    // Empty trash button should be disabled
    const emptyBtn = screen.getByRole("button", { name: /empty trash/i });
    expect(emptyBtn.hasAttribute("disabled")).toBe(true);
  });

  it("renders table with trashed items and enables empty button when items exist", async () => {
    render(<TrashScreen initialItems={MOCK_ITEMS} />);

    expect(screen.getByText("Quantum Computing Foundations")).toBeDefined();
    expect(screen.getByText("Qiskit_Tutorial.pdf")).toBeDefined();
    expect(screen.getByText(/27 days remaining/i)).toBeDefined();
    expect(screen.getByText(/1 day remaining/i)).toBeDefined();

    const emptyBtn = screen.getByRole("button", { name: /empty trash/i });
    expect(emptyBtn.hasAttribute("disabled")).toBe(false);
  });

  it("handles item restore and removes the restored item from the list", async () => {
    const onRestore = vi.fn();
    render(<TrashScreen initialItems={MOCK_ITEMS} onRestore={onRestore} />);

    const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
    const restoreBtn = restoreButtons[0];
    if (!restoreBtn) throw new Error("Expected restore button");
    fireEvent.click(restoreBtn);

    expect(onRestore).toHaveBeenCalledWith("trash-nb-1");
    await waitFor(() => {
      expect(screen.queryByText("Quantum Computing Foundations")).toBeNull();
    });
    // The second item should still be present
    expect(screen.getByText("Qiskit_Tutorial.pdf")).toBeDefined();
  });

  it("launches ConfirmDialog on Delete permanently and purges item on confirmation", async () => {
    const onPurge = vi.fn();
    render(<TrashScreen initialItems={MOCK_ITEMS} onPurge={onPurge} />);

    const purgeButtons = screen.getAllByRole("button", { name: /delete permanently|purge/i });
    const purgeBtn = purgeButtons[0];
    if (!purgeBtn) throw new Error("Expected purge button");
    fireEvent.click(purgeBtn);

    // Ticket 20's ConfirmDialog must open
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.textContent).toContain("Quantum Computing Foundations");

    const confirmBtn = screen.getByRole("button", { name: /delete permanently/i });
    // Initially disabled because phrase is not typed (Level 3 requires notebook title)
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Type phrase to confirm
    const phraseInput = screen.getByLabelText(/type "Quantum Computing Foundations" to confirm/i);
    fireEvent.change(phraseInput, { target: { value: "Quantum Computing Foundations" } });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Confirm the deletion
    fireEvent.click(confirmBtn);

    expect(onPurge).toHaveBeenCalledWith("trash-nb-1");
    await waitFor(() => {
      expect(screen.queryByText("Quantum Computing Foundations")).toBeNull();
    });
  });

  it("launches ConfirmDialog on Empty Trash and clears all items on confirmation", async () => {
    const onEmptyTrash = vi.fn();
    render(<TrashScreen initialItems={MOCK_ITEMS} onEmptyTrash={onEmptyTrash} />);

    const emptyBtn = screen.getByRole("button", { name: /empty trash/i });
    fireEvent.click(emptyBtn);

    // Confirm dialog for emptying trash
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: /empty trash/i });
    // Initially disabled because phrase is not typed (Level 4 requires "DELETE")
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Type phrase to confirm
    const phraseInput = screen.getByLabelText(/type "DELETE" to confirm/i);
    fireEvent.change(phraseInput, { target: { value: "DELETE" } });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(confirmBtn);

    expect(onEmptyTrash).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("Trash is empty")).toBeDefined();
    });
  });

  it("enforces zero elevation shadows on in-page elements (Rule 1.2)", () => {
    const { container } = render(<TrashScreen initialItems={MOCK_ITEMS} />);

    const html = container.innerHTML;
    expect(html).not.toContain("--nb-shadow-float");
    expect(html).not.toContain("shadow-xs");
    expect(html).not.toContain("shadow-md");
    expect(html).not.toContain("shadow-lg");
  });
});
