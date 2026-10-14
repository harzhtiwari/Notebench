// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { AppRoot } from "./app-root";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("persistent client root (ticket 06 slice 3)", () => {
  it("renders the setup screen on direct deep-link refresh", async () => {
    const { container } = render(<AppRoot initialPath="/setup" />);
    await screen.findByText("Complete Setup");
    expect(container.querySelector("form")).not.toBeNull();
  });

  it("switches screens without reload, updates the URL, and keeps shell state alive", () => {
    const { container } = render(<AppRoot initialPath="/" />);
    expect(container.querySelector('[data-testid="route-stub-home"]')).not.toBeNull();

    const shell = container.querySelector('[data-testid="app-shell"]');
    expect(shell).not.toBeNull();

    fireEvent.click(screen.getByText("Dashboard"));

    expect(window.location.pathname).toBe("/dashboard");
    expect(container.querySelector('[data-testid="route-stub-dashboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="app-shell"]')).toBe(shell);
    expect(screen.getByText("Dashboard")).not.toBeNull();
  });

  it("adopts the live deep link when the fallback serves the root shell", async () => {
    window.history.replaceState(null, "", "/notebook/nb-123");
    const { container } = render(<AppRoot initialPath="/" />);
    await screen.findByText("Route not found");
    expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
  });

  it("follows native back/forward through the owned router", async () => {
    const { container } = render(<AppRoot initialPath="/" />);
    fireEvent.click(screen.getByText("Dashboard"));
    expect(window.location.pathname).toBe("/dashboard");

    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="route-stub-home"]')).not.toBeNull();
    });
  });
});
