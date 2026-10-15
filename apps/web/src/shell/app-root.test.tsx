// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { AppRoot } from "./app-root";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("persistent client root (setup-only, stubs removed)", () => {
  it("renders the setup screen on direct deep-link refresh", async () => {
    const { container } = render(<AppRoot initialPath="/setup" />);
    await screen.findByText("Complete Setup");
    expect(container.querySelector('[data-testid="setup-form"]')).not.toBeNull();
  });

  it("renders not-found for removed stub routes", async () => {
    const { container } = render(<AppRoot initialPath="/" />);
    await screen.findByText("Route not found");
    expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
  });

  it("switches screens without reload, updates the URL, and keeps shell state alive", async () => {
    const { container } = render(<AppRoot initialPath="/setup" />);
    await screen.findByText("Complete Setup");

    const shell = container.querySelector('[data-testid="app-shell"]');
    expect(shell).not.toBeNull();

    fireEvent.click(screen.getByText("Setup"));

    expect(window.location.pathname).toBe("/setup");
    expect(container.querySelector('[data-testid="app-shell"]')).toBe(shell);
  });

  it("adopts the live deep link when the fallback serves the root shell", async () => {
    window.history.replaceState(null, "", "/notebook/nb-123");
    const { container } = render(<AppRoot initialPath="/" />);
    await screen.findByText("Route not found");
    expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
  });

  it("follows native back/forward through the owned router", async () => {
    window.history.replaceState(null, "", "/notebook/nb-123");
    const { container } = render(<AppRoot initialPath="/notebook/nb-123" />);
    await screen.findByText("Route not found");
    fireEvent.click(screen.getByText("Setup"));
    expect(window.location.pathname).toBe("/setup");

    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/notebook/nb-123");
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
    });
  });

  it("exposes the app-mounted marker only after real mount", async () => {
    const { container } = render(<AppRoot initialPath="/setup" />);
    await screen.findByText("Complete Setup");
    const shell = container.querySelector('[data-testid="app-shell"]');
    expect(shell?.getAttribute("data-app-mounted")).toBe("true");
  });

  it("mounts the marker alongside a screen control on deep links", async () => {
    const { container } = render(<AppRoot initialPath="/notebook/nb-123" />);
    await screen.findByText("Route not found");
    const shell = container.querySelector('[data-testid="app-shell"]');
    expect(shell?.getAttribute("data-app-mounted")).toBe("true");
    expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
  });

  it("server-rendered HTML never claims the app mounted", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<AppRoot initialPath="/setup" />);
    expect(html).toContain('data-app-mounted="false"');
    expect(html).not.toContain('data-app-mounted="true"');
  });
});
