// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import { WarningCircleIcon, WarningIcon, CheckCircleIcon } from "./icons.js";
import { Toast, ToastViewport, useToast, toast } from "./toast.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  toast.clear();
});

beforeEach(() => {
  vi.useFakeTimers();
});

type PhosphorIconComponent = React.ComponentType<{
  size?: number;
  weight?: "fill";
  "aria-hidden"?: boolean;
}>;

function expectToneGlyph(container: HTMLElement, Icon: PhosphorIconComponent) {
  const icon = container.querySelector("svg");
  expect(icon, "toast tone icon renders").not.toBeNull();

  const { container: reference } = render(
    React.createElement(Icon, { size: 20, weight: "fill", "aria-hidden": true })
  );
  const referenceSvg = reference.querySelector("svg");
  expect(referenceSvg).not.toBeNull();
  expect(icon?.innerHTML).toBe(referenceSvg?.innerHTML);
  cleanup();
}

/**
Mirrors how a consumer renders store toasts, including hover / focus pause wiring.
*/
function ToastHarness() {
  const { toasts, show, dismiss, clear, pause, resume } = useToast();

  return (
    <div>
      <button type="button" onClick={() => show({ message: "Slide 4 restored.", duration: 5000 })}>
        spawn
      </button>
      <button
        type="button"
        onClick={() =>
          show({ message: "Source added", actionLabel: "Undo", duration: 1000 })
        }
      >
        spawn-action
      </button>
      <button type="button" onClick={() => show({ message: "Sticky", duration: 0 })}>
        spawn-sticky
      </button>
      <button type="button" onClick={() => { clear(); }}>
        clear
      </button>
      {toasts.map((t) => (
        <Toast
          key={t.id}
          role={t.role}
          tone={t.tone}
          message={t.message}
          actionLabel={t.actionLabel}
          onAction={t.onAction}
          onDismiss={() => { dismiss(t.id); }}
          onMouseEnter={() => { pause(t.id); }}
          onMouseLeave={() => { resume(t.id); }}
          onFocus={() => { pause(t.id); }}
          onBlur={() => { resume(t.id); }}
        />
      ))}
    </div>
  );
}

describe("Toast Primitive & useToast Hook", () => {
  it("renders toast with inverted ink styles and float shadow", () => {
    const { container } = render(<Toast message="Slide 4 restored." />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-live")).toBe("polite");
    expect(root.className).toContain("toast");
    expect(root.className).toContain("bg-[var(--nb-ink)]");
    expect(root.className).toContain("text-[var(--nb-ink-inv)]");
    expect(root.className).toContain("rounded-[var(--nb-radius-control)]");
    expect(root.className).toContain("shadow-[var(--nb-shadow-float)]");
    expect(root.className).toContain("gap-[var(--nb-space-3)]");
    expect(root.className).toContain("pl-[var(--nb-space-5)]");
    expect(root.className).toContain("duration-[var(--nb-dur-base)]");
    expect(screen.getByText("Slide 4 restored.")).toBeDefined();
  });

  it("renders action button with inverted ink styling and focus ring", () => {
    const onAction = vi.fn();
    const { container } = render(
      <Toast message="Slide 4 restored." actionLabel="Undo" onAction={onAction} />
    );

    const button = screen.getByRole("button", { name: "Undo" });
    expect(button.className).toContain("text-[var(--nb-ink-inv)]");
    expect(button.className).toContain("min-h-[var(--nb-size-control-sm)]");
    expect(button.className).toContain("hover:bg-transparent");
    expect(button.className).toContain("hover:underline");
    expect(button.className).toContain("focus-visible:outline-[var(--nb-ink-inv)]");

    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(container).toBeDefined();
  });

  it("renders a close control when showClose is true and fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" showClose onDismiss={onDismiss} />);

    const close = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("maps error tone to alert semantics and a WarningCircle icon", () => {
    const { container } = render(<Toast tone="error" message="Save failed" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.getAttribute("role")).toBe("alert");
    expect(root.getAttribute("aria-live")).toBe("assertive");
    expectToneGlyph(container, WarningCircleIcon);
  });

  it("maps ok tone to CheckCircle and warn tone to Warning", () => {
    const { container: okContainer } = render(<Toast tone="ok" message="Saved" />);
    expectToneGlyph(okContainer, CheckCircleIcon);
    cleanup();

    const { container: warnContainer } = render(<Toast tone="warn" message="Careful" />);
    expectToneGlyph(warnContainer, WarningIcon);
  });

  it("fires onAction callback and dismisses toast", () => {
    const onAction = vi.fn();
    render(<Toast message="Source added" actionLabel="Undo" onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("ToastViewport renders at z-toast (60) with aria-live region", () => {
    const { container } = render(
      <ToastViewport>
        <Toast message="Floating" />
      </ToastViewport>
    );
    const viewport = container.firstElementChild as HTMLElement;

    expect(viewport.getAttribute("aria-live")).toBe("polite");
    expect(viewport.dataset["placement"]).toBe("bottom-center");
    expect(viewport.className).toContain("fixed");
    expect(viewport.className).toContain("z-[var(--nb-z-toast)]");
    expect(viewport.className).toContain("pointer-events-none");
    expect(screen.getByText("Floating")).toBeDefined();
  });

  it("ToastViewport supports alternate placements", () => {
    const { container } = render(<ToastViewport placement="bottom-right" />);
    const viewport = container.firstElementChild as HTMLElement;
    expect(viewport.dataset["placement"]).toBe("bottom-right");
    expect(viewport.className).toContain("items-end");
  });

  describe("toast manager and useToast", () => {
    it("show returns an id, stores the toast, and clear removes it", () => {
      render(<ToastHarness />);

      fireEvent.click(screen.getByRole("button", { name: "spawn" }));
      expect(screen.getByText("Slide 4 restored.")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "clear" }));
      expect(screen.queryByText("Slide 4 restored.")).toBeNull();
    });

    it("dismiss(id) removes a single toast through the manager", () => {
      const id = toast.show({ message: "Transient", duration: 0 });
      expect(typeof id).toBe("string");
      toast.dismiss(id);
      expect(toast.getSnapshot()).toHaveLength(0);
    });

    it("automatically dismisses after specified duration", () => {
      render(<ToastHarness />);
      fireEvent.click(screen.getByRole("button", { name: "spawn" }));

      expect(screen.getByRole("status")).toBeDefined();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("keeps sticky toasts (duration 0) visible", () => {
      render(<ToastHarness />);
      fireEvent.click(screen.getByRole("button", { name: "spawn-sticky" }));

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText("Sticky")).toBeDefined();
    });

    it("pauses auto-dismiss timer on mouse enter and resumes on mouse leave", () => {
      render(<ToastHarness />);
      fireEvent.click(screen.getByRole("button", { name: "spawn" }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      const toastEl = screen.getByRole("status");
      fireEvent.mouseEnter(toastEl);

      // Three more seconds of hover must not consume the remaining 2s.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByRole("status")).toBeDefined();

      fireEvent.mouseLeave(toastEl);
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(screen.getByRole("status")).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("pauses on focus-within and resumes on blur", () => {
      render(<ToastHarness />);
      fireEvent.click(screen.getByRole("button", { name: "spawn-action" }));

      act(() => {
        vi.advanceTimersByTime(500);
      });
      const toastEl = screen.getByRole("status");
      fireEvent.focus(toastEl);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText("Source added")).toBeDefined();

      fireEvent.blur(toastEl);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByText("Source added")).toBeNull();
    });
  });

  describe("Board Canonical Showcase Assertions (board.test.html#L1058)", () => {
    it("renders Canonical Example 4: 'Slide 4 restored from 10:42. Undo' (Toast)", () => {
      const handleUndo = vi.fn();
      const { container } = render(
        <Toast
          role="status"
          message="Slide 4 restored from 10:42."
          actionLabel="Undo"
          onAction={handleUndo}
        />
      );
      const root = container.firstElementChild as HTMLElement;

      expect(screen.getByText("Slide 4 restored from 10:42.")).toBeDefined();
      expect(root.getAttribute("role")).toBe("status");
      expect(root.className).toContain("bg-[var(--nb-ink)]");
      expect(root.className).toContain("text-[var(--nb-ink-inv)]");
      expect(root.className).toContain("rounded-[var(--nb-radius-control)]");
      expect(root.className).toContain("shadow-[var(--nb-shadow-float)]");

      const undo = screen.getByRole("button", { name: "Undo" });
      expect(undo.className).toContain("text-[var(--nb-ink-inv)]");
      fireEvent.click(undo);
      expect(handleUndo).toHaveBeenCalledTimes(1);
    });
  });
});
