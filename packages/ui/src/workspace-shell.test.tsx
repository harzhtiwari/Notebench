// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";

import {
  workspaceLayout,
  clampPanelWidth,
  useWorkspaceLayout,
  IconRail,
  WorkspacePanel,
} from "./index.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("workspace shell reusables (ticket 12, tokens win over ticket)", () => {
  it("workspaceLayout mirrors token.css widths with ticket behavior constants", () => {
    // Tokens: panel-w 18rem (288px), panel-w-collapsed 3.5rem (56px).
    expect(workspaceLayout.leftDefault).toBe(288);
    expect(workspaceLayout.rightDefault).toBe(288);
    expect(workspaceLayout.collapsedWidth).toBe(56);
    expect(workspaceLayout.minWidth).toBe(220);
    expect(workspaceLayout.maxWidth).toBe(420);
    expect(workspaceLayout.keyboardStep).toBe(16);
    expect(workspaceLayout.storageKey).toBe("notebench:workspace:layout");
  });

  it("clampPanelWidth clamps to the ticket range", () => {
    expect(clampPanelWidth(500)).toBe(420);
    expect(clampPanelWidth(100)).toBe(220);
    expect(clampPanelWidth(300)).toBe(300);
  });

  it("IconRail renders the board collapse button with an accessible name", () => {
    render(<IconRail label="Collapse sources" onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Collapse sources" });
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("IconRail fires onToggle on click", () => {
    let toggled = 0;
    render(<IconRail label="Collapse Studio" onToggle={() => (toggled += 1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Studio" }));
    expect(toggled).toBe(1);
  });

  it("WorkspacePanel renders head with title, collapse and content", () => {
    render(
      <WorkspacePanel
        title="Sources"
        collapseLabel="Collapse sources"
        onToggleCollapse={() => {}}
      >
        <div>Panel body</div>
      </WorkspacePanel>
    );
    expect(screen.getByText("Sources")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Collapse sources" })
    ).toBeDefined();
    expect(screen.getByText("Panel body")).toBeDefined();
  });

  it("IconRail keeps the label as its accessible name", () => {
    let toggled = 0;
    // Dynamic spread: proves the runtime order (props first, label last)
    // against plain-JS callers that bypass the Omit in the props type.
    const sneaky = { "aria-label": "Hacked" } as Record<string, string>;
    render(
      <IconRail label="Collapse sources" onToggle={() => (toggled += 1)} {...sneaky} />
    );
    expect(
      screen.getByRole("button", { name: "Collapse sources" })
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sources" }));
    expect(toggled).toBe(1);
  });

  it("WorkspacePanel renders title suffix next to the title", () => {
    render(
      <WorkspacePanel
        title="Sources"
        titleSuffix={<span>3</span>}
        collapseLabel="Collapse sources"
        onToggleCollapse={() => {}}
      >
        <div>Panel body</div>
      </WorkspacePanel>
    );
    const heading = screen.getByText("Sources").closest("h3");
    expect(heading?.textContent).toContain("3");
  });

  it("useWorkspaceLayout starts at token defaults, uncollapsed", () => {
    let seen: { leftWidth: number; rightWidth: number } | null = null;
    const Probe = (): React.JSX.Element | null => {
      const layout = useWorkspaceLayout();
      seen = { leftWidth: layout.leftWidth, rightWidth: layout.rightWidth };
      return null;
    };
    render(<Probe />);
    expect(seen).toEqual({ leftWidth: 288, rightWidth: 288 });
  });

  it("useWorkspaceLayout clamps, toggles collapse and resets to defaults", () => {
    let api: {
      setLeftWidth: (w: number) => void;
      toggleLeftCollapse: () => void;
      resetToDefaults: () => void;
      leftWidth: number;
      leftCollapsed: boolean;
    } | null = null;
    const Probe = (): React.JSX.Element | null => {
      const layout = useWorkspaceLayout();
      api = layout;
      return null;
    };
    const view = render(<Probe />);
    const get = (): {
      setLeftWidth: (w: number) => void;
      toggleLeftCollapse: () => void;
      resetToDefaults: () => void;
      leftWidth: number;
      leftCollapsed: boolean;
    } => {
      if (api === null) throw new Error("hook did not run");
      return api;
    };
    const rerender = (): void => {
      view.rerender(<Probe />);
    };
    get().setLeftWidth(999);
    rerender();
    expect(get().leftWidth).toBe(420);
    get().toggleLeftCollapse();
    rerender();
    expect(get().leftCollapsed).toBe(true);
    get().resetToDefaults();
    rerender();
    expect(get().leftWidth).toBe(288);
    expect(get().leftCollapsed).toBe(false);
  });
});
