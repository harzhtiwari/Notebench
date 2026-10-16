// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ProgressStages, type ProgressStage } from "./index.js";
import { StatusBadge, CancelButton } from "../primitives/index.js";

afterEach(() => {
  cleanup();
});

describe("StatusBadge", () => {
  it("renders pending status with icon and label", () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText("Pending");
    expect(badge).toBeDefined();
    // Icon is present alongside text (never color alone)
    expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
  });

  it("renders active status with Sparkle icon and label", () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText("Generating");
    expect(badge).toBeDefined();
    expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
  });

  it("renders done status with CheckCircle icon and label", () => {
    render(<StatusBadge status="done" />);
    const badge = screen.getByText("Done");
    expect(badge).toBeDefined();
    expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
  });

  it("renders error status with WarningCircle icon and label", () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText("Error");
    expect(badge).toBeDefined();
    expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
  });

  it("renders cancelled status with XCircle icon and label", () => {
    render(<StatusBadge status="cancelled" />);
    const badge = screen.getByText("Cancelled");
    expect(badge).toBeDefined();
    expect(badge.closest("span")?.querySelector("svg")).not.toBeNull();
  });

  it("supports custom label and custom children", () => {
    const { unmount } = render(<StatusBadge status="active" label="Synthesizing notes" />);
    expect(screen.getByText("Synthesizing notes")).toBeDefined();
    unmount();

    render(<StatusBadge status="done">Finished indexing</StatusBadge>);
    expect(screen.getByText("Finished indexing")).toBeDefined();
  });
});

describe("CancelButton", () => {
  it("renders with cancel icon and label", () => {
    render(<CancelButton />);
    const btn = screen.getByRole("button", { name: /cancel/i });
    expect(btn).toBeDefined();
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("calls onCancel and onClick when clicked", () => {
    const onCancel = vi.fn();
    const onClick = vi.fn();
    render(<CancelButton onCancel={onCancel} onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aborts AbortController and transitions to cancelled state", () => {
    const controller = new AbortController();
    const onCancel = vi.fn();
    render(<CancelButton controller={controller} onCancel={onCancel} />);
    const btn = screen.getByRole("button", { name: /cancel/i });
    expect(controller.signal.aborted).toBe(false);

    fireEvent.click(btn);
    expect(controller.signal.aborted).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cancelled")).toBeDefined();
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("is disabled when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    render(<CancelButton signal={controller.signal} />);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Cancelled")).toBeDefined();
  });
});

describe("ProgressStages", () => {
  const sampleStages: ProgressStage[] = [
    { id: "read", name: "Read sources", status: "done", description: "Done in 12 s" },
    { id: "gen", name: "Writing slides", status: "active", progress: 62 },
    { id: "verify", name: "Check claims", status: "pending", description: "Waiting" },
  ];

  it("renders board steps ordered list with accessible label", () => {
    render(<ProgressStages stages={sampleStages} label="Deck generation progress" />);
    const list = screen.getByRole("list", { name: "Deck generation progress" });
    expect(list).toBeDefined();
    expect(screen.getAllByRole("listitem").length).toBe(3);
  });

  it("renders stage names, status badges, and descriptions", () => {
    render(<ProgressStages stages={sampleStages} />);
    expect(screen.getByText("Read sources")).toBeDefined();
    expect(screen.getByText("Writing slides")).toBeDefined();
    expect(screen.getByText("Check claims")).toBeDefined();

    expect(screen.getByText("Done in 12 s")).toBeDefined();
    expect(screen.getByText("Waiting")).toBeDefined();

    // Badges present for stages (never color alone)
    expect(screen.getByText("Done")).toBeDefined();
    expect(screen.getByText("Generating")).toBeDefined();
    expect(screen.getByText("Pending")).toBeDefined();
  });

  it("renders progressbar with correct accessibility attributes", () => {
    render(<ProgressStages stages={sampleStages} />);
    const progressbar = screen.getByRole("progressbar", { name: "Writing slides" });
    expect(progressbar).toBeDefined();
    expect(progressbar.getAttribute("aria-valuenow")).toBe("62");
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("renders error stage with error message and error badge", () => {
    const errorStages: ProgressStage[] = [
      { id: "step1", name: "Parse document", status: "done" },
      { id: "step2", name: "Model inference", status: "error", error: "Model context window exceeded" },
    ];
    render(<ProgressStages stages={errorStages} />);
    expect(screen.getByText("Model context window exceeded")).toBeDefined();
    expect(screen.getByText("Error")).toBeDefined();
  });

  it("renders overall progressbar when overallProgress is provided", () => {
    render(
      <ProgressStages
        stages={sampleStages}
        overallProgress={45}
        label="Overall generation"
      />
    );
    const overallBar = screen.getByRole("progressbar", { name: "Overall generation" });
    expect(overallBar).toBeDefined();
    expect(overallBar.getAttribute("aria-valuenow")).toBe("45");
  });

  it("renders cancel button when onCancel or controller is provided", () => {
    const controller = new AbortController();
    const onCancel = vi.fn();
    render(
      <ProgressStages
        stages={sampleStages}
        controller={controller}
        onCancel={onCancel}
      />
    );
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn);
    expect(controller.signal.aborted).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
