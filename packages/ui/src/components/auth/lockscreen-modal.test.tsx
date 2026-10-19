// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";

import { LockscreenModal } from "./lockscreen-modal.js";
import { useCountdown } from "../../hooks/use-countdown.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function CountdownProbe({ targetMs }: { targetMs: number }) {
  return <output>{useCountdown(targetMs)}</output>;
}

describe("session lockout patterns (ticket 05)", () => {
  it("renders a centred lockscreen with passcode field and unlock action", () => {
    render(<LockscreenModal open onUnlock={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Unlock Notebench" })
    ).toBeDefined();
    expect(screen.getByLabelText("Passcode")).toBeDefined();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDefined();
  });

  it("disables unlock and shows the countdown while locked", () => {
    render(
      <LockscreenModal open lockedSecondsRemaining={45} onUnlock={() => {}} />
    );
    const unlock = screen.getByRole("button", { name: "Unlock" });
    expect(unlock.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("0:45");
  });

  it("calls onUnlock with the typed passcode once unlocked", () => {
    let received: string | null = null;
    render(
      <LockscreenModal
        open
        lockedSecondsRemaining={0}
        onUnlock={(passcode) => {
          received = passcode;
        }}
      />
    );
    const input = screen.getByLabelText("Passcode");
    fireEvent.change(input, { target: { value: "correct horse battery staple!" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(received).toBe("correct horse battery staple!");
  });

  it("surfaces a server error on the passcode field", () => {
    render(
      <LockscreenModal open error="Wrong passcode." onUnlock={() => {}} />
    );
    expect(screen.getByText("Wrong passcode.")).toBeDefined();
    expect(screen.getByLabelText("Passcode").getAttribute("aria-invalid")).toBe(
      "true"
    );
  });

  it("cannot be dismissed with Escape while unlocked", () => {
    const onOpenChange = vi.fn();
    render(
      <LockscreenModal open onOpenChange={onOpenChange} onUnlock={() => {}} />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("cannot be dismissed with Escape while locked", () => {
    const onOpenChange = vi.fn();
    render(
      <LockscreenModal
        open
        lockedSecondsRemaining={30}
        onOpenChange={onOpenChange}
        onUnlock={() => {}}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("ignores outside pointer downs", async () => {
    const onOpenChange = vi.fn();
    render(
      <LockscreenModal open onOpenChange={onOpenChange} onUnlock={() => {}} />
    );
    // Radix registers its pointerdown listener on the next macrotask and
    // defers the outside event to the following click.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not call onUnlock while the lockout is active", () => {
    const onUnlock = vi.fn();
    const { baseElement } = render(
      <LockscreenModal open lockedSecondsRemaining={30} onUnlock={onUnlock} />
    );
    const form = baseElement.querySelector("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("clears the passcode when the lockscreen closes and reopens", () => {
    const { rerender } = render(<LockscreenModal open onUnlock={() => {}} />);
    fireEvent.change(screen.getByLabelText("Passcode"), {
      target: { value: "hunter2" },
    });
    rerender(<LockscreenModal open={false} onUnlock={() => {}} />);
    rerender(<LockscreenModal open onUnlock={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Passcode");
    expect(input.value).toBe("");
  });

  it("shows the remaining attempts hint when the server reports it", () => {
    render(<LockscreenModal open attemptsRemaining={2} onUnlock={() => {}} />);
    expect(screen.getByText("2 attempts remaining.")).toBeDefined();
  });

  it("useCountdown ticks down whole seconds and clamps at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { unmount } = render(<CountdownProbe targetMs={1_005_000} />);
    expect(screen.getByRole("status").textContent).toBe("5");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status").textContent).toBe("3");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status").textContent).toBe("0");
    unmount();
  });
});
