// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ProviderRow,
  KeyTestButton,
  CloudDisclosureBadge,
} from "./index.js";

afterEach(() => {
  cleanup();
});

describe("provider and key patterns (ticket 06)", () => {
  it("ProviderRow renders name, helper, action slot, and cloud badge", () => {
    render(
      <ProviderRow
        name="OpenAI"
        description="Cloud models via API key."
        cloud
        providerName="OpenAI"
      >
        <button type="button">Test key</button>
      </ProviderRow>
    );
    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("Cloud models via API key.")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Test key" })
    ).toBeDefined();
    expect(screen.getByText(/transmitted to OpenAI/)).toBeDefined();
  });

  it("ProviderRow omits the disclosure badge for local providers", () => {
    render(<ProviderRow name="Ollama" description="Local models." />);
    expect(screen.queryByText(/transmitted/)).toBeNull();
  });

  it("KeyTestButton idle calls onTest and always pairs icon with label", () => {
    const onTest = vi.fn();
    const { container } = render(
      <KeyTestButton state="idle" onTest={onTest} />
    );
    const button = screen.getByRole("button", { name: "Test Key" });
    expect(container.querySelector("svg")).not.toBeNull();
    fireEvent.click(button);
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  it("KeyTestButton testing is disabled with a spinner", () => {
    const onTest = vi.fn();
    render(<KeyTestButton state="testing" onTest={onTest} />);
    const button = screen.getByRole("button", { name: "Testing…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(onTest).not.toHaveBeenCalled();
  });

  it("KeyTestButton ok shows verification with latency", () => {
    const { container } = render(
      <KeyTestButton state="ok" latencyMs={42} onTest={() => {}} />
    );
    expect(
      screen.getByText("Verified Connected (latency: 42ms)")
    ).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("KeyTestButton fail shows the sanitised server message", () => {
    render(
      <KeyTestButton
        state="fail"
        message="401 Unauthorized: Invalid API key."
        onTest={() => {}}
      />
    );
    expect(
      screen.getByText("401 Unauthorized: Invalid API key.")
    ).toBeDefined();
  });

  it("CloudDisclosureBadge warns with icon and label, never color-alone", () => {
    const { container } = render(
      <CloudDisclosureBadge providerName="Anthropic" />
    );
    const badge = screen.getByText(/transmitted to Anthropic/);
    expect(badge.className).toContain("var(--nb-warn");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
