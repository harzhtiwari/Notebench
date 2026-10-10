// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./resizable.js";

describe("Resizable Primitives (@notebook/ui)", () => {
  it("renders panel group with horizontal layout and panels", () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal" className="test-group">
        <ResizablePanel id="left" defaultSize={20}>
          <div>Left Content</div>
        </ResizablePanel>
        <ResizableHandle id="handle" withHandle />
        <ResizablePanel id="right" defaultSize={80}>
          <div>Right Content</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(screen.getByText("Left Content")).toBeDefined();
    expect(screen.getByText("Right Content")).toBeDefined();
    expect(container.querySelector('[data-panel-group-direction="horizontal"]')).toBeDefined();
  });

  it("renders resize handle with separator role and accessible attributes", () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel id="p1" defaultSize={50}>
          <div>Pane 1</div>
        </ResizablePanel>
        <ResizableHandle id="test-handle" withHandle aria-label="Resize panels" />
        <ResizablePanel id="p2" defaultSize={50}>
          <div>Pane 2</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );

    const handle = screen.getByRole("separator", { name: "Resize panels" });
    expect(handle).toBeDefined();
  });
});
