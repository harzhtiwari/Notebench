// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";

import { LockscreenModal, useCountdown } from "./index.js";

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

  it("useCountdown ticks down whole seconds and clamps at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { unmount } = render(<CountdownProbe targetMs={1_005_000} />);
    expect(screen.getByRole("status").textContent).toBe("5");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("status").textContent).toBe("3");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status").textContent).toBe("0");
    unmount();
  });
});
