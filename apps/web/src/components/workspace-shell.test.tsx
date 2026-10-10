// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceShell } from "./workspace-shell";

describe("WorkspaceShell Component", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.innerWidth = 1200;
  });

  it("renders desktop 3-pane layout with sources, center, and studio slots", () => {
    render(
      <WorkspaceShell
        sourcesSlot={<div data-testid="sources-content">Sources List</div>}
        centerSlot={<div data-testid="center-content">Conversation Stream</div>}
        composerSlot={<div data-testid="composer-content">Composer Bar</div>}
        studioSlot={<div data-testid="studio-content">Studio Catalog</div>}
      />
    );

    expect(screen.getByTestId("sources-content")).toBeDefined();
    expect(screen.getByTestId("center-content")).toBeDefined();
    expect(screen.getByTestId("composer-content")).toBeDefined();
    expect(screen.getByTestId("studio-content")).toBeDefined();
  });

  it("renders accessible splitter separators with double click snap reset", () => {
    render(
      <WorkspaceShell
        sourcesSlot={<div>Sources</div>}
        centerSlot={<div>Center</div>}
        composerSlot={<div>Composer</div>}
        studioSlot={<div>Studio</div>}
      />
    );

    const leftSplitter = screen.getByTestId("splitter-left");
    expect(leftSplitter.getAttribute("role")).toBe("separator");

    // Double-clicking splitter triggers reset
    fireEvent.doubleClick(leftSplitter);
    const leftPane = screen.getByTestId("pane-sources");
    expect(leftPane.style.width).toBe("300px");
  });

  it("renders 48px rail when shelf is collapsed", () => {
    render(
      <WorkspaceShell
        sourcesSlot={<div>Sources</div>}
        centerSlot={<div>Center</div>}
        composerSlot={<div>Composer</div>}
        studioSlot={<div>Studio</div>}
      />
    );

    const collapseButton = screen.getByTestId("collapse-sources-btn");
    fireEvent.click(collapseButton);

    const leftPane = screen.getByTestId("pane-sources");
    expect(leftPane.style.width).toBe("48px");
  });

  it("renders mobile single panel with 44px bottom navigation rail when < 768px", () => {
    window.innerWidth = 640;
    render(
      <WorkspaceShell
        sourcesSlot={<div data-testid="sources-content">Sources List</div>}
        centerSlot={<div data-testid="center-content">Conversation Stream</div>}
        composerSlot={<div data-testid="composer-content">Composer Bar</div>}
        studioSlot={<div data-testid="studio-content">Studio Catalog</div>}
      />
    );

    // Bottom navigation rail must be rendered
    const navRail = screen.getByTestId("mobile-nav-rail");
    expect(navRail).toBeDefined();

    // Default mobile tab is chat
    expect(screen.getByTestId("center-content")).toBeDefined();

    // Switch to sources tab
    const sourcesTabBtn = screen.getByTestId("mobile-tab-sources");
    expect(sourcesTabBtn.classList.contains("min-h-[44px]")).toBe(true);
    fireEvent.click(sourcesTabBtn);

    expect(screen.getByTestId("sources-content")).toBeDefined();
  });
});
