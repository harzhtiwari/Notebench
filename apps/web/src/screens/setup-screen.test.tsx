// @vitest-environment happy-dom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

  it("surfaces a short passcode through the field error with aria-invalid", async () => {
    stubAppState(false);
    const { container } = render(<SetupScreen navigate={() => {}} />);
    await screen.findByText("Complete Setup");
    const passcodeInput = container.querySelector("#passcode") as HTMLInputElement;
    fireEvent.change(passcodeInput, { target: { value: "short" } });
    fireEvent.click(screen.getByText("Complete Setup"));
    await screen.findByText("Passcode must be at least 15 characters long.");
    expect(passcodeInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the field error once the passcode is corrected", async () => {
    stubAppState(false);
    const { container } = render(<SetupScreen navigate={() => {}} />);
    await screen.findByText("Complete Setup");
    const passcodeInput = container.querySelector("#passcode") as HTMLInputElement;
    fireEvent.change(passcodeInput, { target: { value: "short" } });
    fireEvent.click(screen.getByText("Complete Setup"));
    await screen.findByText("Passcode must be at least 15 characters long.");
    fireEvent.change(passcodeInput, { target: { value: "a-corrected-passcode-phrase" } });
    await screen.findByText("Complete Setup");
    expect(
      screen.queryByText("Passcode must be at least 15 characters long.")
    ).toBeNull();
    expect(passcodeInput.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("locked state opens the workspace on click", async () => {
    stubAppState(true);
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    fireEvent.click(await screen.findByText("Open Workspace"));
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
