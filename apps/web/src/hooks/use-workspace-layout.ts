"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export const LAYOUT_STORAGE_KEY = "notebench:workspace:layout";

interface WorkspacePersistedLayout {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export const DEFAULT_LAYOUT: WorkspacePersistedLayout = {
  leftWidth: 300,
  rightWidth: 320,
  leftCollapsed: false,
  rightCollapsed: false,
};

export const MIN_LEFT_WIDTH = 220;
export const MAX_LEFT_WIDTH = 460;
export const MIN_RIGHT_WIDTH = 240;
export const MAX_RIGHT_WIDTH = 480;
const MOBILE_BREAKPOINT = 768;

type MobileTab = "sources" | "chat" | "studio";

interface WorkspaceLayout {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  isMobile: boolean;
  activeMobileTab: MobileTab;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  toggleLeftCollapse: () => void;
  toggleRightCollapse: () => void;
  resetLeftWidth: () => void;
  resetRightWidth: () => void;
  resetToDefaults: () => void;
  setActiveMobileTab: (tab: MobileTab) => void;
  isHydrated: boolean;
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [leftWidth, setLeftWidthState] = useState<number>(DEFAULT_LAYOUT.leftWidth);
  const [rightWidth, setRightWidthState] = useState<number>(DEFAULT_LAYOUT.rightWidth);
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(DEFAULT_LAYOUT.leftCollapsed);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(DEFAULT_LAYOUT.rightCollapsed);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>("chat");
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const isHydratedRef = useRef<boolean>(false);

  // 1. Initial hydration from localStorage & viewport check
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        if (
          typeof parsed["leftWidth"] === "number" &&
          typeof parsed["rightWidth"] === "number" &&
          typeof parsed["leftCollapsed"] === "boolean" &&
          typeof parsed["rightCollapsed"] === "boolean"
        ) {
          setLeftWidthState(
            Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, parsed["leftWidth"]))
          );
          setRightWidthState(
            Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, parsed["rightWidth"]))
          );
          setLeftCollapsed(parsed["leftCollapsed"]);
          setRightCollapsed(parsed["rightCollapsed"]);
        }
      }
    } catch {
      // Ignore JSON parse errors or restricted localStorage
    }

    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    isHydratedRef.current = true;
    setIsHydrated(true);
  }, []);

  // 2. Persist to localStorage on change
  useEffect(() => {
    if (!isHydratedRef.current || typeof window === "undefined") return;

    try {
      const payload: WorkspacePersistedLayout = {
        leftWidth,
        rightWidth,
        leftCollapsed,
        rightCollapsed,
      };
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage quota or private mode restriction
    }
  }, [leftWidth, rightWidth, leftCollapsed, rightCollapsed]);

  // 3. Responsive resize listener
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 4. Global keyboard shortcuts: Mod+B (Left), Mod+] (Right)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setLeftCollapsed((prev) => !prev);
      } else if (e.key === "]") {
        e.preventDefault();
        setRightCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const setLeftWidth = useCallback((width: number) => {
    setLeftWidthState(Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, width)));
  }, []);

  const setRightWidth = useCallback((width: number) => {
    setRightWidthState(Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, width)));
  }, []);

  const toggleLeftCollapse = useCallback(() => {
    setLeftCollapsed((prev) => !prev);
  }, []);

  const toggleRightCollapse = useCallback(() => {
    setRightCollapsed((prev) => !prev);
  }, []);

  const resetLeftWidth = useCallback(() => {
    setLeftWidthState(DEFAULT_LAYOUT.leftWidth);
    setLeftCollapsed(false);
  }, []);

  const resetRightWidth = useCallback(() => {
    setRightWidthState(DEFAULT_LAYOUT.rightWidth);
    setRightCollapsed(false);
  }, []);

  const resetToDefaults = useCallback(() => {
    setLeftWidthState(DEFAULT_LAYOUT.leftWidth);
    setRightWidthState(DEFAULT_LAYOUT.rightWidth);
    setLeftCollapsed(DEFAULT_LAYOUT.leftCollapsed);
    setRightCollapsed(DEFAULT_LAYOUT.rightCollapsed);
  }, []);

  return {
    leftWidth,
    rightWidth,
    leftCollapsed,
    rightCollapsed,
    isMobile,
    activeMobileTab,
    setLeftWidth,
    setRightWidth,
    toggleLeftCollapse,
    toggleRightCollapse,
    resetLeftWidth,
    resetRightWidth,
    resetToDefaults,
    setActiveMobileTab,
    isHydrated,
  };
}
