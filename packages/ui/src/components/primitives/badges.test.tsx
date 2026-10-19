// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";

import {
  Badge,
  StatusBadge,
  VersionBadge,
  CloudDisclosureBadge,
  type BadgeVariant,
} from "./badges.js";

afterEach(() => {
  cleanup();
});

const VARIANT_TOKENS: readonly [BadgeVariant, string, string][] = [
  ["default", "bg-[var(--nb-well)]", "text-[var(--nb-ink-2)]"],
  ["ok", "bg-[var(--nb-ok-wash)]", "text-[var(--nb-ok)]"],
  ["warn", "bg-[var(--nb-warn-wash)]", "text-[var(--nb-warn)]"],
  ["danger", "bg-[var(--nb-danger-wash)]", "text-[var(--nb-danger)]"],
  ["ai", "bg-[var(--nb-ai-wash)]", "text-[var(--nb-ai)]"],
  ["you", "bg-[var(--nb-you-wash)]", "text-[var(--nb-you)]"],
  ["link", "bg-[var(--nb-link-wash)]", "text-[var(--nb-link)]"],
];

describe("Badge (consolidated badges family)", () => {
  it("renders the base .badge shape with chip radius and token-bound type", () => {
    render(<Badge>Indexed</Badge>);
    const badge = screen.getByText("Indexed");
    expect(badge.className).toContain("inline-flex");
    expect(badge.className).toContain("rounded-[var(--nb-radius-chip)]");
    expect(badge.className).toContain("text-xs");
    expect(badge.className).toContain("font-semibold");
    expect(badge.className).toContain("font-[family-name:var(--nb-font-ui)]");
  });

  it.each(VARIANT_TOKENS)(
    "maps variant '%s' to its wash + role tokens",
    (variant, wash, role) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      const badge = screen.getByText(variant);
      expect(badge.className).toContain(wash);
      expect(badge.className).toContain(role);
    }
  );

  it("renders the icon ahead of the label so status is never color-alone", () => {
    const { container } = render(
      <Badge variant="ok" icon={<svg data-testid="badge-icon" />}>
        Verified
      </Badge>
    );
    const badge = screen.getByText("Verified");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[data-testid="badge-icon"]')).not.toBeNull();
  });

  it("merges custom className and forwards span attributes", () => {
    render(
      <Badge className="my-badge" data-state="locked" title="Locked">
        Locked
      </Badge>
    );
    const badge = screen.getByText("Locked");
    expect(badge.className).toContain("my-badge");
    expect(badge.dataset["state"]).toBe("locked");
    expect(badge.getAttribute("title")).toBe("Locked");
  });

  it("forwards refs to the underlying span", () => {
    const ref = React.createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>Ref</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});

describe("StatusBadge", () => {
  const STATUS_CASES: readonly [Parameters<typeof StatusBadge>[0]["status"], string, string][] = [
    ["pending", "Pending", "bg-[var(--nb-well)]"],
    ["active", "Generating", "bg-[var(--nb-ai-wash)]"],
    ["done", "Done", "bg-[var(--nb-ok-wash)]"],
    ["error", "Error", "bg-[var(--nb-danger-wash)]"],
    ["cancelled", "Cancelled", "bg-[var(--nb-well)]"],
  ];

  it.each(STATUS_CASES)(
    "renders '%s' with label text, icon, and wash token (never color-alone)",
    (status, label, wash) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge.className).toContain(wash);
      // Icon is present alongside text (never color alone)
      expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
    }
  );

  it("uses the faint ink role for cancelled", () => {
    render(<StatusBadge status="cancelled" />);
    expect(screen.getByText("Cancelled").className).toContain(
      "var(--nb-ink-3)"
    );
  });

  it("supports custom label and custom children", () => {
    const { unmount } = render(
      <StatusBadge status="active" label="Synthesizing notes" />
    );
    expect(screen.getByText("Synthesizing notes")).toBeDefined();
    unmount();

    render(<StatusBadge status="done">Finished indexing</StatusBadge>);
    expect(screen.getByText("Finished indexing")).toBeDefined();
  });

  it("honours a custom icon override", () => {
    const { container } = render(
      <StatusBadge status="done" icon={<svg data-testid="custom-icon" />} />
    );
    expect(container.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
    expect(screen.getByText("Done")).toBeDefined();
  });
});

describe("VersionBadge", () => {
  it("renders the milestone arrival copy", () => {
    render(<VersionBadge milestone="0.2" />);
    const badge = screen.getByText("Coming in 0.2");
    expect(badge.dataset["testid"]).toBe("version-badge");
  });

  it("renders 'Coming later' for the later milestone", () => {
    render(<VersionBadge milestone="later" />);
    expect(screen.getByText("Coming later")).toBeDefined();
  });

  it("uses compact 2xs type, chip radius, and the hairline border", () => {
    render(<VersionBadge milestone="0.3" />);
    const badge = screen.getByText("Coming in 0.3");
    expect(badge.className).toContain("text-[length:var(--nb-text-2xs)]");
    expect(badge.className).toContain("rounded-[var(--nb-radius-chip)]");
    expect(badge.className).toContain("border-[var(--nb-hairline)]");
    expect(badge.className).toContain("bg-[var(--nb-well)]");
    expect(badge.className).toContain("text-[var(--nb-ink-2)]");
  });

  it("merges custom className", () => {
    render(<VersionBadge milestone="0.3" className="mt-2" />);
    expect(screen.getByText("Coming in 0.3").className).toContain("mt-2");
  });
});

describe("CloudDisclosureBadge", () => {
  it("names the provider and pairs the warning icon with the disclosure copy", () => {
    const { container } = render(
      <CloudDisclosureBadge providerName="Anthropic" />
    );
    const badge = screen.getByText(/transmitted to Anthropic/);
    expect(badge.className).toContain("var(--nb-warn");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("accepts the provider alias to prevent DOM leaks", () => {
    render(<CloudDisclosureBadge provider="OpenAI" />);
    expect(screen.getByText(/transmitted to OpenAI/)).toBeDefined();
  });

  it("falls back to generic provider copy", () => {
    render(<CloudDisclosureBadge />);
    expect(screen.getByText(/transmitted to this provider/)).toBeDefined();
  });

  it("wraps long disclosure copy (whitespace-normal override)", () => {
    render(<CloudDisclosureBadge providerName="Anthropic" />);
    expect(
      screen.getByText(/transmitted to Anthropic/).className
    ).toContain("whitespace-normal");
  });
});
