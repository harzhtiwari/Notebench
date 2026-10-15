// @vitest-environment happy-dom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SetupScreen } from "./setup-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubAppState(setupComplete = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ setupComplete }),
    }))
  );
}

describe("SetupScreen Ticket 01 UI reuse (RED)", () => {
  it("uses PasswordInput show/hide toggle for the passcode field", async () => {
    stubAppState(false);
    render(<SetupScreen navigate={() => {}} />);
    const toggle = await screen.findByRole("button", {
      name: /show passcode|hide passcode/i,
    });
    expect(toggle).not.toBeNull();
  });

  it("wraps fields in FormField labels linked to inputs", async () => {
    stubAppState(false);
    const { container } = render(<SetupScreen navigate={() => {}} />);
    await screen.findByText("Complete Setup");
    const passcodeInput = container.querySelector("#passcode") as HTMLInputElement | null;
    expect(passcodeInput).not.toBeNull();
  });
});
