// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  CitationPopover,
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type DialogSize,
} from "./overlays.js";

afterEach(cleanup);

/**
 * Consolidated overlays seams (dialog-popover upgrade plan, section 5).
 *
 * Seam 1: Dialog token invariants
 * Seam 2: Dialog sizing scale
 * Seam 3: Dialog anatomy composition
 * Seam 4: Dialog dismissal & accessibility
 * Seam 5: Popover & tooltip stacking
 * Seam 6: CitationPopover integration
 * Seam 7 (consumer regression gate) runs the existing consumer suites:
 * deletion-reauth, export-import-dialog, timeline-patterns, storage-patterns,
 * and ui.test - not part of this file.
 */

describe("Seam 1: Dialog token invariants", () => {
  it("renders DialogContent with the board modal surface tokens", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Token dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-[var(--nb-radius-modal)]");
    expect(dialog.className).toContain("border-[var(--nb-hairline)]");
    expect(dialog.className).toContain("bg-[var(--nb-sheet)]");
    expect(dialog.className).toContain("shadow-[var(--nb-shadow-modal)]");
    expect(dialog.className).toContain("z-[var(--nb-z-modal)]");
  });

  it("renders DialogOverlay with the scrim token", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Token dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const overlay = Array.from(document.body.querySelectorAll("div")).find(
      (element) => element.className.includes("bg-[var(--nb-scrim)]")
    );
    expect(overlay).toBeDefined();
    expect(overlay?.className).toContain("z-[var(--nb-z-modal)]");
  });
});

describe("Seam 2: Dialog sizing scale", () => {
  const sizes: Array<[DialogSize, string]> = [
    ["sm", "w-[min(var(--nb-layout-modal-sm),calc(100%-var(--nb-space-8)))]"],
    ["md", "w-[min(var(--nb-layout-modal-md),calc(100%-var(--nb-space-8)))]"],
    ["lg", "w-[min(var(--nb-layout-modal-lg),calc(100%-var(--nb-space-8)))]"],
    ["viewer", "w-[min(var(--nb-layout-modal-lg),calc(100%-var(--nb-space-8)))]"],
  ];

  it.each(sizes)("applies the %s width rule", (size, expected) => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent size={size} aria-describedby={undefined}>
          <DialogTitle>{`${size} dialog`}</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("dialog").className).toContain(expected);
  });

  it("leaves the width to the consumer for size custom", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          size="custom"
          className="w-[42rem]"
          aria-describedby={undefined}
        >
          <DialogTitle>Custom dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("nb-layout-modal");
    expect(dialog.className).not.toContain("1020px");
    expect(dialog.className).toContain("w-[42rem]");
  });
});

describe("Seam 3: Dialog anatomy composition", () => {
  it("composes header, title, body, and footer with board padding", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Anatomy dialog</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>Body text</p>
          </DialogBody>
          <DialogFooter>
            <button type="button">Cancel</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    const title = screen.getByRole("heading", { name: "Anatomy dialog" });
    expect(title.className).toContain(
      "font-[family-name:var(--nb-font-read)]"
    );
    expect(title.className).toContain("text-[length:var(--nb-text-xl)]");
    expect(title.className).toContain(
      "font-[number:var(--nb-weight-semibold)]"
    );

    const header = title.parentElement;
    expect(header?.className).toContain("px-[var(--nb-space-5)]");
    expect(header?.className).toContain("pt-[var(--nb-space-5)]");
    expect(header?.className).toContain("pb-[var(--nb-space-2)]");

    const body = screen.getByText("Body text").parentElement;
    expect(body?.className).toContain("grid");
    expect(body?.className).toContain("gap-[var(--nb-space-3)]");
    expect(body?.className).toContain("px-[var(--nb-space-5)]");
    expect(body?.className).toContain("pt-[var(--nb-space-2)]");
    expect(body?.className).toContain("pb-[var(--nb-space-4)]");

    const footer = screen.getByRole("button", { name: "Cancel" })
      .parentElement;
    expect(footer?.className).toContain("justify-end");
    expect(footer?.className).toContain("gap-[var(--nb-space-2)]");
    expect(footer?.className).toContain("px-[var(--nb-space-5)]");
    expect(footer?.className).toContain("pt-[var(--nb-space-3)]");
    expect(footer?.className).toContain("pb-[var(--nb-space-5)]");

    const children = Array.from(dialog.children);
    expect(header).not.toBeNull();
    expect(body).not.toBeNull();
    expect(footer).not.toBeNull();
    if (header && body && footer) {
      expect(children.indexOf(header)).toBeLessThan(children.indexOf(body));
      expect(children.indexOf(body)).toBeLessThan(children.indexOf(footer));
    }
  });
});

describe("Seam 4: Dialog dismissal & accessibility", () => {
  it("links title and description and exposes aria-modal with focus guards", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Linked title</DialogTitle>
            <DialogDescription>Linked description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    const title = screen.getByRole("heading", { name: "Linked title" });
    const description = screen.getByText("Linked description");

    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      document.querySelectorAll("[data-radix-focus-guard]").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("dismisses on Escape and through the close button", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Dismissable dialog</DialogTitle>
            <DialogDescription>Dismissable description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the default Close label overridable through props", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Custom label dialog</DialogTitle>
          <DialogCloseButton aria-label="Dismiss dialog" />
        </DialogContent>
      </Dialog>
    );

    const close = screen.getByRole("button", { name: "Dismiss dialog" });
    expect(close.getAttribute("aria-label")).toBe("Dismiss dialog");
  });
});

describe("Seam 5: Popover & tooltip stacking", () => {
  it("renders PopoverContent with popover layer tokens below the modal layer", () => {
    render(
      <Popover open onOpenChange={() => {}}>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>
    );

    const content = screen.getByText("Popover body");
    expect(content.className).toContain("z-[var(--nb-z-popover)]");
    expect(content.className).not.toContain("z-[var(--nb-z-modal)]");
    expect(content.className).toContain("shadow-[var(--nb-shadow-float)]");
    expect(content.className).toContain("rounded-[var(--nb-radius-menu)]");
  });

  it("renders TooltipContent with toast layer tokens and the tag curvature", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Tooltip trigger</TooltipTrigger>
          <TooltipContent>Tooltip body</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const content = screen.getByText("Tooltip body");
    expect(content.className).toContain("z-[var(--nb-z-toast)]");
    expect(content.className).not.toContain("z-[var(--nb-z-modal)]");
    expect(content.className).toContain("shadow-[var(--nb-shadow-float)]");
    expect(content.className).toContain("rounded-[var(--nb-radius-tag)]");
  });
});

describe("Seam 6: CitationPopover integration", () => {
  it("renders the board citation card with passage well and action button", () => {
    const onOpenSource = vi.fn();
    render(
      <CitationPopover
        open
        title="Grid study 2024"
        location="Page 12"
        passage="The grid remained stable under load."
        onOpenSource={onOpenSource}
        trigger={<button type="button">citation chip</button>}
      />
    );

    expect(screen.getByText("Grid study 2024")).toBeDefined();
    expect(screen.getByText("Page 12")).toBeDefined();
    expect(
      screen.getByRole("group", { name: "Citation preview" })
    ).toBeDefined();

    const passage = screen.getByText("The grid remained stable under load.");
    expect(passage.className).toContain("passage");
    expect(passage.className).toContain("rounded-[var(--nb-radius-well)]");
    expect(passage.className).toContain(
      "font-[family-name:var(--nb-font-read)]"
    );

    const action = screen.getByRole("button", { name: "Open in source" });
    fireEvent.click(action);
    expect(onOpenSource).toHaveBeenCalledTimes(1);
  });
});
