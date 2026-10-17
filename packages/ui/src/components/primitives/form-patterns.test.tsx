// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

import { FormField, PasswordInput, FormError, FormSuccess } from "./index.js";
import { validatePasscode } from "../../lib/passcode.js";

describe("setup passcode form patterns (ticket 04)", () => {
  it("FormField links label, input, and error (board .field/.err)", () => {
    render(
      <FormField label="Session Passcode (Optional)" error="Too short">
        <PasswordInput id="passcode" />
      </FormField>
    );
    const input = screen.getByLabelText("Session Passcode (Optional)");
    expect(input.getAttribute("id")).toBe("passcode");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const error = screen.getByText("Too short");
    expect(error.getAttribute("id")).not.toBeNull();
    expect(describedBy).toContain(error.getAttribute("id") as string);
  });

  it("PasswordInput masks by default and toggles visibility", () => {
    render(<PasswordInput aria-label="Session Passcode (Optional)" />);
    const input = screen.getByLabelText("Session Passcode (Optional)") as HTMLInputElement;
    expect(input.type).toBe("password");
    const toggle = screen.getByRole("button", { name: "Show passcode" });
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide passcode" })).toBeDefined();
  });

  it("FormError and FormSuccess use alert/status roles with danger/ok roles", () => {
    const { unmount } = render(<FormError>Passcode must be longer.</FormError>);
    const err = screen.getByRole("alert");
    expect(err.className).toContain("var(--nb-danger");
    unmount();
    render(<FormSuccess>Setup completed.</FormSuccess>);
    const ok = screen.getByRole("status");
    expect(ok.className).toContain("var(--nb-ok");
  });

  it("validatePasscode: optional, min 15, max 128, no composition rules", () => {
    expect(validatePasscode("")).toBeNull();
    expect(validatePasscode("short")).not.toBeNull();
    expect(validatePasscode("a".repeat(14))).not.toBeNull();
    expect(validatePasscode("a".repeat(15))).toBeNull();
    expect(validatePasscode("alllowercaseletters")).toBeNull();
    expect(validatePasscode("a".repeat(64))).toBeNull();
    expect(validatePasscode("a".repeat(129))).not.toBeNull();
  });
});
