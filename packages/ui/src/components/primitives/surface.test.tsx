// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelDescription,
  PanelContent,
  PanelFooter,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Well,
  WellTitle,
  WellDescription,
  Sheet,
  SheetTitle,
  SheetDescription,
  getNestedRadius,
  concentricRadiusClass,
} from "./surface.js";

afterEach(() => {
  cleanup();
});

describe("Surfaces & Containers (surface.tsx)", () => {
  describe("Concentric Radius Formula", () => {
    it("calculates concentric nested radius correctly", () => {
      // Panel (24px) - 16px padding = 8px -> sm
      expect(getNestedRadius("panel", 16)).toBe("sm");
      // Well (12px) - 8px padding = 4px -> xs
      expect(getNestedRadius("well", 8)).toBe("xs");
      // Lower bound is always xs (4px)
      expect(getNestedRadius("panel", 24)).toBe("xs");
      expect(getNestedRadius("well", 16)).toBe("xs");
    });

    it("generates correct concentric radius classes", () => {
      expect(concentricRadiusClass("panel", 16)).toBe("rounded-[var(--nb-radius-sm)]");
      expect(concentricRadiusClass("well", 8)).toBe("rounded-[var(--nb-radius-xs)]");
    });
  });

  describe("Panel Primitive", () => {
    it("renders Panel with hairline border, sheet bg, panel radius and NO shadow", () => {
      render(
        <Panel data-testid="test-panel">
          <PanelHeader>
            <PanelTitle>Workspace Inspector</PanelTitle>
            <PanelDescription>Source metadata and tools</PanelDescription>
          </PanelHeader>
          <PanelContent>Panel Body</PanelContent>
          <PanelFooter>Updated just now</PanelFooter>
        </Panel>
      );
      const panel = screen.getByTestId("test-panel");
      expect(panel.className).toContain("rounded-[var(--nb-radius-panel)]");
      expect(panel.className).toContain("border-[var(--nb-hairline)]");
      expect(panel.className).toContain("bg-[var(--nb-sheet)]");
      expect(panel.className).not.toContain("shadow");
      expect(screen.getByText("Workspace Inspector")).toBeDefined();
    });
  });

  describe("Card Primitive", () => {
    it("renders Card with card radius, hairline border, and supports interactive hover state", () => {
      render(
        <Card data-testid="test-card" interactive>
          <CardHeader>
            <CardTitle>Q3 Roadmap</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
      );
      const card = screen.getByTestId("test-card");
      expect(card.className).toContain("rounded-[var(--nb-radius-card)]");
      expect(card.className).toContain("border-[var(--nb-hairline)]");
      expect(card.className).toContain("hover:border-[var(--nb-edge)]");
      expect(card.className).toContain("cursor-pointer");
      expect(card.className).not.toContain("shadow");
    });

    it("renders Card selected state with edge border and ring", () => {
      render(<Card data-testid="selected-card" selected />);
      const card = screen.getByTestId("selected-card");
      expect(card.className).toContain("border-[var(--nb-edge)]");
      expect(card.className).toContain("ring-1");
    });
  });

  describe("Well Primitive", () => {
    it("renders Well recessed without border by default", () => {
      render(<Well data-testid="test-well">Recessed data</Well>);
      const well = screen.getByTestId("test-well");
      expect(well.className).toContain("bg-[var(--nb-well)]");
      expect(well.className).toContain("rounded-[var(--nb-radius-well)]");
      expect(well.className).not.toContain("border-[var(--nb-edge)]");
      expect(well.className).not.toContain("border");
    });

    it("renders Well with hairline border when bordered=true", () => {
      render(<Well data-testid="bordered-well" bordered>Bordered well</Well>);
      const well = screen.getByTestId("bordered-well");
      expect(well.className).toContain("border-[var(--nb-hairline)]");
      expect(well.className).not.toContain("border-[var(--nb-edge)]");
    });
  });

  describe("Sheet Primitive", () => {
    it("renders Sheet without shadow-xs", () => {
      render(<Sheet data-testid="test-sheet">Modal sheet</Sheet>);
      const sheet = screen.getByTestId("test-sheet");
      expect(sheet.className).toContain("bg-[var(--nb-sheet)]");
      expect(sheet.className).toContain("border-[var(--nb-hairline)]");
      expect(sheet.className).not.toContain("shadow-xs");
      expect(sheet.className).not.toContain("shadow");
    });
  });

  describe("Line-height Roles", () => {
    it("applies token line-height roles to titles and descriptions", () => {
      render(
        <>
          <PanelTitle data-testid="panel-title">Panel title</PanelTitle>
          <PanelDescription data-testid="panel-desc">Panel description</PanelDescription>
          <CardTitle data-testid="card-title">Card title</CardTitle>
          <CardDescription data-testid="card-desc">Card description</CardDescription>
          <WellTitle data-testid="well-title">Well title</WellTitle>
          <WellDescription data-testid="well-desc">Well description</WellDescription>
          <SheetTitle data-testid="sheet-title">Sheet title</SheetTitle>
          <SheetDescription data-testid="sheet-desc">Sheet description</SheetDescription>
        </>
      );
      for (const id of ["panel-title", "card-title", "well-title", "sheet-title"]) {
        expect(screen.getByTestId(id).className).toContain("leading-[var(--nb-leading-tight)]");
      }
      for (const id of ["panel-desc", "card-desc", "well-desc", "sheet-desc"]) {
        expect(screen.getByTestId(id).className).toContain("leading-[var(--nb-leading-ui)]");
      }
    });
  });
});
