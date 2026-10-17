// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as IconCatalog from "./icons.js";
import { resolveIconProps } from "./icons.js";
import { Button, IconButton } from "./button.js";

type IconComponent = React.ComponentType<{
  size?: number | string | undefined;
  weight?: string | undefined;
  "aria-hidden"?: boolean | "true" | "false" | undefined;
  className?: string | undefined;
}>;

function isIconComponent(val: unknown): val is IconComponent {
  return typeof val === "function" || (typeof val === "object" && val !== null);
}

afterEach(() => {
  cleanup();
});

describe("Icon UI Architecture (iconui.md & button-upgrade-plan.md)", () => {
  describe("Seam 1: resolveIconProps resolution logic", () => {
    it("resolves default options to 20px, regular weight, and aria-hidden: true", () => {
      const props = resolveIconProps();
      expect(props).toEqual({
        size: 20,
        weight: "regular",
        "aria-hidden": true,
      });
    });

    it("enforces strict automatic bold invariant for 16px (sm), disallowing regular override", () => {
      const propsSm = resolveIconProps({ size: "sm" });
      expect(propsSm).toEqual({
        size: 16,
        weight: "bold",
        "aria-hidden": true,
      });

      const props16 = resolveIconProps({ size: 16 });
      expect(props16).toEqual({
        size: 16,
        weight: "bold",
        "aria-hidden": true,
      });

      // Strict invariant: passing weight='regular' at 16px is disallowed and remains 'bold'
      const propsRegular16 = resolveIconProps({ size: 16, weight: "regular" });
      expect(propsRegular16.weight).toBe("bold");

      const propsRegularSm = resolveIconProps({ size: "sm", weight: "regular" });
      expect(propsRegularSm.weight).toBe("bold");
    });

    it("resolves md and lg to regular weight by default", () => {
      const propsMd = resolveIconProps({ size: "md" });
      expect(propsMd).toEqual({
        size: 20,
        weight: "regular",
        "aria-hidden": true,
      });

      const propsLg = resolveIconProps({ size: "lg" });
      expect(propsLg).toEqual({
        size: 24,
        weight: "regular",
        "aria-hidden": true,
      });

      const props24 = resolveIconProps({ size: 24 });
      expect(props24).toEqual({
        size: 24,
        weight: "regular",
        "aria-hidden": true,
      });
    });

    it("enforces active fill contract (weight='fill') across all sizes when active is true", () => {
      expect(resolveIconProps({ size: "sm", active: true }).weight).toBe("fill");
      expect(resolveIconProps({ size: 16, active: true }).weight).toBe("fill");
      expect(resolveIconProps({ size: "md", active: true }).weight).toBe("fill");
      expect(resolveIconProps({ size: 20, active: true }).weight).toBe("fill");
      expect(resolveIconProps({ size: "lg", active: true }).weight).toBe("fill");
      expect(resolveIconProps({ size: 24, active: true }).weight).toBe("fill");
    });

    it("allows explicit caller weight to override active fill (e.g. for non-fill icons like ArrowsClockwise/X)", () => {
      expect(resolveIconProps({ size: "sm", active: true, weight: "bold" }).weight).toBe("bold");
      expect(resolveIconProps({ size: "md", active: true, weight: "bold" }).weight).toBe("bold");
      expect(resolveIconProps({ size: "lg", active: true, weight: "bold" }).weight).toBe("bold");
    });

    it("allows explicit weight override for 20px and 24px when active is false", () => {
      expect(resolveIconProps({ size: "md", weight: "bold" }).weight).toBe("bold");
      expect(resolveIconProps({ size: "lg", weight: "fill" }).weight).toBe("fill");
    });

    it("always preserves aria-hidden: true", () => {
      expect(resolveIconProps({ size: "sm", active: true })["aria-hidden"]).toBe(true);
      expect(resolveIconProps({ size: "lg" })["aria-hidden"]).toBe(true);
    });
  });

  describe("Seam 2: 32 Canonical Starter Set (iconui.md Table 3)", () => {
    const canonicalStarterSet = [
      "ArrowDown",
      "ArrowUp",
      "ArrowsClockwise",
      "Cards",
      "ChartBar",
      "CheckCircle",
      "Circle",
      "ClockCounterClockwise",
      "Copy",
      "DownloadSimple",
      "FileDoc",
      "FilePdf",
      "FileText",
      "Gear",
      "Globe",
      "Info",
      "LockSimple",
      "MagnifyingGlass",
      "Notebook",
      "PencilSimple",
      "Plus",
      "PresentationChart",
      "Question",
      "ShieldCheck",
      "SidebarSimple",
      "Sparkle",
      "TreeStructure",
      "VideoCamera",
      "Warning",
      "WarningCircle",
      "Waveform",
      "X",
    ] as const;

    it("exports all 32 canonical starter icons from iconui.md Table 3", () => {
      expect(canonicalStarterSet).toHaveLength(32);
      for (const iconName of canonicalStarterSet) {
        const comp = (IconCatalog as Record<string, unknown>)[iconName];
        expect(comp, `Canonical icon ${iconName} must be exported`).toBeDefined();
        expect(typeof comp, `Canonical icon ${iconName} must be a valid component`).toMatch(/function|object/);
      }
    });

    it("renders each of the 32 canonical starter icons with resolveIconProps in small, medium, and large", () => {
      for (const iconName of canonicalStarterSet) {
        const maybeIcon = (IconCatalog as Record<string, unknown>)[iconName];
        expect(isIconComponent(maybeIcon), `${iconName} must be an icon component`).toBe(true);
        if (!isIconComponent(maybeIcon)) continue;
        const IconComp = maybeIcon;

        // 16px bold
        const { container: c16 } = render(React.createElement(IconComp, resolveIconProps({ size: "sm" })));
        const svg16 = c16.querySelector("svg");
        expect(svg16, `${iconName} (16px) should render an svg`).not.toBeNull();
        expect(svg16?.getAttribute("width")).toBe("16");
        expect(svg16?.getAttribute("height")).toBe("16");
        expect(svg16?.getAttribute("aria-hidden")).toBe("true");
        cleanup();

        // 20px regular
        const { container: c20 } = render(React.createElement(IconComp, resolveIconProps({ size: "md" })));
        const svg20 = c20.querySelector("svg");
        expect(svg20, `${iconName} (20px) should render an svg`).not.toBeNull();
        expect(svg20?.getAttribute("width")).toBe("20");
        expect(svg20?.getAttribute("height")).toBe("20");
        cleanup();

        // 24px regular
        const { container: c24 } = render(React.createElement(IconComp, resolveIconProps({ size: "lg" })));
        const svg24 = c24.querySelector("svg");
        expect(svg24, `${iconName} (24px) should render an svg`).not.toBeNull();
        expect(svg24?.getAttribute("width")).toBe("24");
        expect(svg24?.getAttribute("height")).toBe("24");
        cleanup();

        // Active fill
        const { container: cActive } = render(React.createElement(IconComp, resolveIconProps({ size: "md", active: true })));
        const svgActive = cActive.querySelector("svg");
        expect(svgActive, `${iconName} (active) should render an svg`).not.toBeNull();
        cleanup();
      }
    });
  });

  describe("Seam 3: Full Icon Catalog (Every single exported icon)", () => {
    // Filter out non-component exports like resolveIconProps
    const allIconEntries = Object.entries(IconCatalog).filter(([name]) => name !== "resolveIconProps");

    it("verifies the full icon catalog contains all operational and extended icons (70+ icons)", () => {
      expect(allIconEntries.length).toBeGreaterThanOrEqual(70);
    });

    it("verifies every single icon in the catalog is a valid React component and renders with resolveIconProps", () => {
      for (const [name, Component] of allIconEntries) {
        expect(isIconComponent(Component), `Icon ${name} must be an icon component`).toBe(true);
        if (!isIconComponent(Component)) continue;
        const IconComp = Component;

        // Test rendering with resolveIconProps in sm (16px bold)
        const { container: cSm } = render(React.createElement(IconComp, resolveIconProps({ size: "sm" })));
        const svgSm = cSm.querySelector("svg");
        expect(svgSm, `Icon ${name} at sm size must render an <svg> element`).not.toBeNull();
        expect(svgSm?.getAttribute("width")).toBe("16");
        expect(svgSm?.getAttribute("height")).toBe("16");
        expect(svgSm?.getAttribute("aria-hidden")).toBe("true");
        cleanup();

        // Test rendering with resolveIconProps in active state (fill)
        const { container: cAct } = render(React.createElement(IconComp, resolveIconProps({ size: "md", active: true })));
        const svgAct = cAct.querySelector("svg");
        expect(svgAct, `Icon ${name} with active: true must render an <svg> element`).not.toBeNull();
        expect(svgAct?.getAttribute("width")).toBe("20");
        expect(svgAct?.getAttribute("height")).toBe("20");
        expect(svgAct?.getAttribute("aria-hidden")).toBe("true");
        cleanup();
      }
    });
  });

  describe("Seam 4: Board Reference Buttons (board.test.html#L952-955)", () => {
    it("renders the 1. Settings button (IconButton nb_btn_secondary nb_btn_icon_md)", () => {
      const { container } = render(
        <IconButton
          variant="nb_btn_secondary"
          size="nb_btn_icon_md"
          icon={IconCatalog.Gear}
          aria-label="Settings"
        />
      );

      const button = container.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Settings");
      expect(button?.className).toContain("min-h-[var(--nb-size-control-md)]");

      const svg = button?.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("class")).toContain("h-[var(--nb-size-icon-md)]");
    });

    it("renders the 2. Copy button (IconButton nb_btn_secondary nb_btn_icon_sm)", () => {
      const { container } = render(
        <IconButton
          variant="nb_btn_secondary"
          size="nb_btn_icon_sm"
          icon={IconCatalog.Copy}
          aria-label="Copy citation"
        />
      );

      const button = container.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Copy citation");
      expect(button?.className).toContain("min-h-[var(--nb-size-control-sm)]");

      const svg = button?.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("class")).toContain("h-[var(--nb-size-icon-sm)]");
    });

    it("renders the 3. Export button (Button nb_btn_secondary nb_btn_md with leading DownloadSimple)", () => {
      const { container } = render(
        <Button variant="nb_btn_secondary" size="nb_btn_md" leadingIcon={IconCatalog.DownloadSimple}>
          Export
        </Button>
      );

      const button = container.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.textContent).toContain("Export");
      expect(button?.className).toContain("min-h-[var(--nb-size-control-md)]");
      expect(button?.className).toContain("gap-[var(--nb-space-2)]");

      const svg = button?.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("class")).toContain("h-[var(--nb-size-icon-sm)]");
    });
  });

  describe("Seam 5: Universal Button + All 73 Icons Integration", () => {
    const allIconEntries = Object.entries(IconCatalog).filter(([name]) => name !== "resolveIconProps");

    it("verifies all 73 icons mount properly as leadingIcon in Button and as icon in IconButton", () => {
      for (const [name, Component] of allIconEntries) {
        expect(isIconComponent(Component), `Icon ${name} must be an icon component`).toBe(true);
        if (!isIconComponent(Component)) continue;
        const IconComp = Component;

        // 1. Mount inside IconButton (sm)
        const { container: cIconSm } = render(
          <IconButton size="nb_btn_icon_sm" icon={IconComp} aria-label={`Action ${name}`} />
        );
        const iconBtn = cIconSm.querySelector("button");
        expect(iconBtn, `IconButton with ${name} must mount`).not.toBeNull();
        const iconSvg = iconBtn?.querySelector("svg");
        expect(iconSvg, `IconButton with ${name} must contain an SVG`).not.toBeNull();
        expect(iconSvg?.getAttribute("aria-hidden")).toBe("true");
        cleanup();

        // 2. Mount inside Button as leadingIcon
        const { container: cBtn } = render(
          <Button size="nb_btn_md" leadingIcon={IconComp}>
            {name}
          </Button>
        );
        const stdBtn = cBtn.querySelector("button");
        expect(stdBtn, `Button with leadingIcon ${name} must mount`).not.toBeNull();
        expect(stdBtn?.textContent).toContain(name);
        const leadingSvg = stdBtn?.querySelector("svg");
        expect(leadingSvg, `Button with leadingIcon ${name} must contain an SVG`).not.toBeNull();
        expect(leadingSvg?.getAttribute("aria-hidden")).toBe("true");
        cleanup();
      }
    });
  });
});
