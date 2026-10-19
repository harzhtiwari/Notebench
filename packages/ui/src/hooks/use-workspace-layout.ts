import * as React from "react";
import { workspaceLayout, clampPanelWidth } from "../lib/workspace-layout.js";

export interface WorkspaceLayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isHydrated: boolean;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  toggleLeftCollapse: () => void;
  toggleRightCollapse: () => void;
  resetToDefaults: () => void;
}

interface PersistedLayout {
  leftWidth: unknown;
  rightWidth: unknown;
  leftCollapsed: unknown;
  rightCollapsed: unknown;
}

function readStored(): PersistedLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = globalThis.localStorage.getItem(workspaceLayout.storageKey);
    return raw === null ? null : (JSON.parse(raw) as PersistedLayout);
  } catch {
    return null;
  }
}

function asWidth(value: unknown, fallback: number): number {
  return typeof value === "number" ? clampPanelWidth(value) : fallback;
}

function isStoredFlag(value: unknown): boolean {
  return value === true;
}

/**
Single hook owning workspace layout state (ticket 12 one-hook rule).
Serves both side panels; widths persist in localStorage and survive reload.
Mounted guard avoids hydration mismatch on static export.
*/
export function useWorkspaceLayout(): WorkspaceLayoutState {
  const [leftWidth, setLeftWidthState] = React.useState<number>(
    workspaceLayout.leftDefault
  );
  const [rightWidth, setRightWidthState] = React.useState<number>(
    workspaceLayout.rightDefault
  );
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    const stored = readStored();
    if (stored !== null) {
      setLeftWidthState(asWidth(stored.leftWidth, workspaceLayout.leftDefault));
      setRightWidthState(
        asWidth(stored.rightWidth, workspaceLayout.rightDefault)
      );
      setLeftCollapsed(isStoredFlag(stored.leftCollapsed));
      setRightCollapsed(isStoredFlag(stored.rightCollapsed));
    }
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    try {
      globalThis.localStorage.setItem(
        workspaceLayout.storageKey,
        JSON.stringify({ leftWidth, rightWidth, leftCollapsed, rightCollapsed })
      );
    } catch {
      // Storage full or blocked: layout still works for this session.
    }
  }, [leftWidth, rightWidth, leftCollapsed, rightCollapsed, isHydrated]);

  const setLeftWidth = React.useCallback((width: number) => {
    setLeftWidthState(clampPanelWidth(width));
  }, []);

  const setRightWidth = React.useCallback((width: number) => {
    setRightWidthState(clampPanelWidth(width));
  }, []);

  const toggleLeftCollapse = React.useCallback(() => {
    setLeftCollapsed((was) => !was);
  }, []);

  const toggleRightCollapse = React.useCallback(() => {
    setRightCollapsed((was) => !was);
  }, []);

  const resetToDefaults = React.useCallback(() => {
    setLeftWidthState(workspaceLayout.leftDefault);
    setRightWidthState(workspaceLayout.rightDefault);
    setLeftCollapsed(false);
    setRightCollapsed(false);
  }, []);

  return {
    leftWidth,
    rightWidth,
    leftCollapsed,
    rightCollapsed,
    isHydrated,
    setLeftWidth,
    setRightWidth,
    toggleLeftCollapse,
    toggleRightCollapse,
    resetToDefaults,
  };
}
