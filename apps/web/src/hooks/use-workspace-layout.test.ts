// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWorkspaceLayout,
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
} from "./use-workspace-layout";

describe("useWorkspaceLayout Hook", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.innerWidth = 1200;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default dimensions and collapses", () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    expect(result.current.leftWidth).toBe(DEFAULT_LAYOUT.leftWidth);
    expect(result.current.rightWidth).toBe(DEFAULT_LAYOUT.rightWidth);
    expect(result.current.leftCollapsed).toBe(false);
    expect(result.current.rightCollapsed).toBe(false);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.activeMobileTab).toBe("chat");
  });

  it("persists changes to localStorage", () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      result.current.setLeftWidth(380);
      result.current.setRightWidth(400);
      result.current.toggleLeftCollapse();
    });

    expect(result.current.leftWidth).toBe(380);
    expect(result.current.rightWidth).toBe(400);
    expect(result.current.leftCollapsed).toBe(true);

    const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}");
    expect(stored.leftWidth).toBe(380);
    expect(stored.rightWidth).toBe(400);
    expect(stored.leftCollapsed).toBe(true);
  });

  it("restores previously persisted state from localStorage", () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        leftWidth: 340,
        rightWidth: 360,
        leftCollapsed: true,
        rightCollapsed: false,
      })
    );

    const { result } = renderHook(() => useWorkspaceLayout());

    expect(result.current.leftWidth).toBe(340);
    expect(result.current.rightWidth).toBe(360);
    expect(result.current.leftCollapsed).toBe(true);
    expect(result.current.rightCollapsed).toBe(false);
  });

  it("resets to defaults when resetToDefaults is invoked", () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      result.current.setLeftWidth(440);
      result.current.toggleRightCollapse();
    });

    expect(result.current.leftWidth).toBe(440);
    expect(result.current.rightCollapsed).toBe(true);

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.leftWidth).toBe(DEFAULT_LAYOUT.leftWidth);
    expect(result.current.rightWidth).toBe(DEFAULT_LAYOUT.rightWidth);
    expect(result.current.leftCollapsed).toBe(false);
    expect(result.current.rightCollapsed).toBe(false);
  });

  it("toggles left and right shelves via keyboard shortcuts Mod+B and Mod+]", () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    // Mod+B toggles Left
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", ctrlKey: true })
      );
    });
    expect(result.current.leftCollapsed).toBe(true);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", metaKey: true })
      );
    });
    expect(result.current.leftCollapsed).toBe(false);

    // Mod+] toggles Right
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "]", ctrlKey: true })
      );
    });
    expect(result.current.rightCollapsed).toBe(true);
  });

  it("detects mobile viewport when innerWidth < 768px", () => {
    window.innerWidth = 640;
    const { result } = renderHook(() => useWorkspaceLayout());

    expect(result.current.isMobile).toBe(true);

    act(() => {
      result.current.setActiveMobileTab("sources");
    });
    expect(result.current.activeMobileTab).toBe("sources");
  });
});
