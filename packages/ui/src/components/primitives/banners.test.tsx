// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { WarningCircleIcon, WarningIcon, InfoIcon, CheckCircleIcon } from "./icons.js";
import {
  Banner,
  BannerIcon,
  BannerBody,
  BannerTitle,
  BannerDescription,
  BannerActions,
  FormError,
  FormSuccess,
  AlertBanner,
} from "./banners.js";

afterEach(() => {
  cleanup();
});

type PhosphorIconComponent = React.ComponentType<{
  size?: number;
  weight?: "fill";
  "aria-hidden"?: boolean;
}>;

/**
Compares the rendered lead glyph against a bare reference render of the icon.
*/
function expectLeadGlyph(container: HTMLElement, Icon: PhosphorIconComponent) {
  const lead = container.querySelector("svg");
  expect(lead, "banner lead icon renders").not.toBeNull();

  const { container: reference } = render(
    React.createElement(Icon, { size: 20, weight: "fill", "aria-hidden": true })
  );
  const referenceSvg = reference.querySelector("svg");
  expect(referenceSvg).not.toBeNull();
  expect(lead?.innerHTML).toBe(referenceSvg?.innerHTML);
  cleanup();
}

function bannersRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild;
  expect(root).not.toBeNull();
  return root as HTMLElement;
}

describe("Banner Primitive", () => {
  it("renders with default info tone and role='status'", () => {
    const { container } = render(<Banner title="Heads up" message="Body copy" />);
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-live")).toBe("polite");
    expect(root.className).toContain("bg-[var(--nb-link-wash)]");
    expect(root.className).toContain("border-[var(--nb-link)]");
    expect(root.className).toContain("rounded-[var(--nb-radius-card)]");
    expect(root.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(root.className).toContain("max-w-[var(--nb-layout-chat-max)]");
    expectLeadGlyph(container, InfoIcon);
  });

  it("renders error tone with role='alert' and WarningCircle icon", () => {
    const { container } = render(
      <Banner tone="error" title="Something broke" message="Details" />
    );
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("alert");
    expect(root.getAttribute("aria-live")).toBe("assertive");
    expect(root.className).toContain("bg-[var(--nb-danger-wash)]");
    expect(root.className).toContain("border-[var(--nb-danger)]");
    expect(root.className).toContain("banner--error");

    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toBe("Something broke");
    expect(heading.className).toContain("text-[var(--nb-danger)]");
    expectLeadGlyph(container, WarningCircleIcon);
  });

  it("renders warn tone with Warning icon and proper wash tokens", () => {
    const { container } = render(
      <Banner tone="warn" title="Watch out" message="Details" />
    );
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("alert");
    expect(root.className).toContain("bg-[var(--nb-warn-wash)]");
    expect(root.className).toContain("border-[var(--nb-warn)]");
    expect(root.className).toContain("banner--warn");
    expectLeadGlyph(container, WarningIcon);
  });

  it("renders ok tone with CheckCircle icon and ok-wash tokens", () => {
    const { container } = render(
      <Banner tone="ok" title="All good" message="Details" />
    );
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("status");
    expect(root.className).toContain("bg-[var(--nb-ok-wash)]");
    expect(root.className).toContain("border-[var(--nb-ok)]");
    expect(root.className).toContain("banner--ok");
    expectLeadGlyph(container, CheckCircleIcon);
  });

  it("renders neutral tone on the well background with a hairline border", () => {
    const { container } = render(
      <Banner tone="neutral" title="Nothing to report" />
    );
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("status");
    expect(root.className).toContain("bg-[var(--nb-well)]");
    expect(root.className).toContain("border-[var(--nb-hairline)]");
    expectLeadGlyph(container, InfoIcon);
  });

  it("renders action buttons and handles click callbacks", () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();
    render(
      <Banner
        tone="error"
        title="Fault"
        message="Details"
        actionLabel="Try again"
        onAction={onAction}
        secondaryActionLabel="Open model settings"
        onSecondaryAction={onSecondaryAction}
      />
    );

    const primary = screen.getByRole("button", { name: "Try again" });
    expect(primary.className).toContain("bg-[var(--nb-sheet)]");
    expect(primary.className).toContain("min-h-[var(--nb-size-control-sm)]");
    fireEvent.click(primary);
    expect(onAction).toHaveBeenCalledTimes(1);

    const secondary = screen.getByRole("button", { name: "Open model settings" });
    expect(secondary.className).toContain("bg-transparent");
    fireEvent.click(secondary);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it("renders dismiss button and triggers onDismiss callback", () => {
    const onDismiss = vi.fn();
    render(<Banner title="Dismissible" onDismiss={onDismiss} />);

    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom dismiss label", () => {
    render(<Banner title="Dismissible" dismissLabel="Close banner" onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Close banner" })).toBeDefined();
  });

  it("renders compact mode with reduced padding for form validation", () => {
    const { container } = render(<Banner compact title="Compact" message="Body" />);
    const root = bannersRoot(container);

    expect(root.className).toContain("p-[var(--nb-space-3)]");
    expect(root.className).toContain("gap-[var(--nb-space-2)]");
    expect(root.className).toContain("text-[length:var(--nb-text-xs)]");
  });

  it("keeps the regular spacing when compact is not set", () => {
    const { container } = render(<Banner title="Regular" message="Body" />);
    const root = bannersRoot(container);

    expect(root.className).toContain("p-[var(--nb-space-4)]");
    expect(root.className).toContain("gap-[var(--nb-space-3)]");
  });

  it("lets callers override the default role", () => {
    render(<Banner tone="error" role="status" title="Soft error" />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exports the compound pieces for custom compositions", () => {
    expect(BannerIcon).toBeDefined();
    expect(BannerBody).toBeDefined();
    expect(BannerTitle).toBeDefined();
    expect(BannerDescription).toBeDefined();
    expect(BannerActions).toBeDefined();
  });

  it("renders FormError adapter with error tone, alert role, and WarningCircle icon", () => {
    const { container } = render(<FormError>Passcode must be longer.</FormError>);
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("alert");
    expect(root.className).toContain("var(--nb-danger)");
    expect(root.className).toContain("p-[var(--nb-space-3)]");
    expect(screen.getByText("Passcode must be longer.")).toBeDefined();
    expectLeadGlyph(container, WarningCircleIcon);
  });

  it("renders FormSuccess adapter with ok tone, status role, and CheckCircle icon", () => {
    const { container } = render(<FormSuccess message="Setup completed." />);
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("status");
    expect(root.className).toContain("var(--nb-ok)");
    expect(screen.getByText("Setup completed.")).toBeDefined();
    expectLeadGlyph(container, CheckCircleIcon);
  });

  it("keeps the AlertBanner alias contract (warn default, Exposure alert title)", () => {
    const onAction = vi.fn();
    const { container } = render(
      <AlertBanner message="Notebench is exposed." actionLabel="Manage access" onAction={onAction} />
    );
    const root = bannersRoot(container);

    expect(root.getAttribute("role")).toBe("alert");
    expect(root.className).toContain("banner--warn");
    expect(screen.getByText("Exposure alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Manage access" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  describe("Board Canonical Showcase Assertions (board.test.html#L1053-1060)", () => {
    it("renders Canonical Example 1: 'Ollama is not running' (Error Banner)", () => {
      const handleRetry = vi.fn();
      const handleOpenSettings = vi.fn();
      const { container } = render(
        <Banner
          tone="error"
          role="alert"
          title="Ollama is not running"
          message={
            <>
              The model at 127.0.0.1:11434 did not answer. Start it with{" "}
              <code className="rounded-[var(--nb-radius-xs)] bg-[var(--nb-well)] px-[var(--nb-space-1)] py-[var(--nb-space-0-5)] font-mono text-xs">
                ollama serve
              </code>
              , then try again.
            </>
          }
          actionLabel="Try again"
          onAction={handleRetry}
          secondaryActionLabel="Open model settings"
          onSecondaryAction={handleOpenSettings}
        />
      );
      const root = bannersRoot(container);

      expect(root.getAttribute("role")).toBe("alert");
      expect(root.className).toContain("bg-[var(--nb-danger-wash)]");
      expect(root.className).toContain("border-[var(--nb-danger)]");
      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("Ollama is not running");
      expect(screen.getByText("ollama serve").tagName).toBe("CODE");

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(handleRetry).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Open model settings" }));
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);

      expectLeadGlyph(container, WarningCircleIcon);
    });

    it("renders Canonical Example 2: 'Not enough disk space for the speech model' (Warning Banner)", () => {
      const { container } = render(
        <Banner
          tone="warn"
          role="status"
          title="Not enough disk space for the speech model"
          message="It needs 1.5 GB and 0.9 GB is free. Free some space or pick a smaller model."
        />
      );
      const root = bannersRoot(container);

      expect(root.getAttribute("role")).toBe("status");
      expect(root.className).toContain("bg-[var(--nb-warn-wash)]");
      expect(root.className).toContain("border-[var(--nb-warn)]");
      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "Not enough disk space for the speech model"
      );
      expect(
        screen.getByText(
          "It needs 1.5 GB and 0.9 GB is free. Free some space or pick a smaller model."
        )
      ).toBeDefined();
      expectLeadGlyph(container, WarningIcon);
    });

    it("renders Canonical Example 3: 'No chat model is set up yet' (Info Banner)", () => {
      const { container } = render(
        <Banner
          tone="info"
          role="status"
          title="No chat model is set up yet"
          message="Add an API key or connect Ollama to turn on cited answers."
        />
      );
      const root = bannersRoot(container);

      expect(root.getAttribute("role")).toBe("status");
      expect(root.className).toContain("bg-[var(--nb-link-wash)]");
      expect(root.className).toContain("border-[var(--nb-link)]");
      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "No chat model is set up yet"
      );
      expectLeadGlyph(container, InfoIcon);
    });

    it("renders the compound pieces in the canonical grid shape", () => {
      render(
        <Banner tone="info">
          <BannerIcon />
          <BannerBody>
            <BannerTitle>Composed</BannerTitle>
            <BannerDescription>Composed body</BannerDescription>
            <BannerActions>
              <button type="button">Act</button>
            </BannerActions>
          </BannerBody>
        </Banner>
      );

      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("Composed");
      expect(screen.getByText("Composed body")).toBeDefined();
      expect(screen.getByRole("button", { name: "Act" })).toBeDefined();
    });
  });
});
