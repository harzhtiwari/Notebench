"use client";

import React, { useCallback } from "react";
import {
  useWorkspaceLayout,
  MIN_LEFT_WIDTH,
  MAX_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  MAX_RIGHT_WIDTH,
} from "../hooks/use-workspace-layout";

interface WorkspaceShellProps {
  sourcesSlot: React.ReactNode;
  centerSlot: React.ReactNode;
  composerSlot?: React.ReactNode;
  studioSlot: React.ReactNode;
  className?: string;
}

function startSplitterDrag(
  e: React.MouseEvent,
  calculateWidth: (clientX: number) => number,
  onResize: (width: number) => void
) {
  e.preventDefault();
  document.body.style.cursor = "col-resize";

  const handleMouseMove = (moveEvent: MouseEvent) => {
    onResize(calculateWidth(moveEvent.clientX));
  };

  const handleMouseUp = () => {
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}

export function WorkspaceShell({
  sourcesSlot,
  centerSlot,
  composerSlot,
  studioSlot,
  className = "",
}: WorkspaceShellProps) {
  const {
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
    setActiveMobileTab,
  } = useWorkspaceLayout();

  // Mouse drag handlers for left splitter
  const handleLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      startSplitterDrag(
        e,
        (clientX) => Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, clientX - 14)),
        setLeftWidth
      );
    },
    [setLeftWidth]
  );

  // Mouse drag handlers for right splitter
  const handleRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      startSplitterDrag(
        e,
        (clientX) =>
          Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, window.innerWidth - clientX - 14)),
        setRightWidth
      );
    },
    [setRightWidth]
  );

  // Keyboard navigation on splitters
  const handleLeftKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLeftWidth(leftWidth - 10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setLeftWidth(leftWidth + 10);
      } else if (e.key === "Enter") {
        e.preventDefault();
        resetLeftWidth();
      }
    },
    [leftWidth, setLeftWidth, resetLeftWidth]
  );

  const handleRightKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setRightWidth(rightWidth + 10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setRightWidth(rightWidth - 10);
      } else if (e.key === "Enter") {
        e.preventDefault();
        resetRightWidth();
      }
    },
    [rightWidth, setRightWidth, resetRightWidth]
  );

  // -------------------------------------------------------------------------
  // MOBILE VIEW (<768px)
  // -------------------------------------------------------------------------
  if (isMobile) {
    return (
      <div
        className={`relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--nb-ground)] text-[var(--nb-ink)] ${className}`}
      >
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden p-3 pb-[52px]">
          {activeMobileTab === "sources" && (
            <div className="h-full w-full overflow-y-auto rounded-2xl border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-4 shadow-xs">
              {sourcesSlot}
            </div>
          )}

          {activeMobileTab === "chat" && (
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pb-2">
                <div className="mx-auto max-w-[62ch] px-2">{centerSlot}</div>
              </div>
              {composerSlot && (
                <div className="shrink-0 border-t border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-2">
                  {composerSlot}
                </div>
              )}
            </div>
          )}

          {activeMobileTab === "studio" && (
            <div className="h-full w-full overflow-y-auto rounded-2xl border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-4 shadow-xs">
              {studioSlot}
            </div>
          )}
        </div>

        {/* 44px Minimum Touch Target Bottom Navigation Rail */}
        <div
          data-testid="mobile-nav-rail"
          className="absolute bottom-0 left-0 right-0 z-50 flex h-[52px] items-center justify-around border-t border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-2"
        >
          <button
            type="button"
            data-testid="mobile-tab-sources"
            onClick={() => setActiveMobileTab("sources")}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
              activeMobileTab === "sources"
                ? "bg-[var(--nb-well)] text-[var(--nb-ink)] font-semibold"
                : "text-[var(--nb-ink-2)] hover:text-[var(--nb-ink)]"
            }`}
          >
            Sources
          </button>
          <button
            type="button"
            data-testid="mobile-tab-chat"
            onClick={() => setActiveMobileTab("chat")}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
              activeMobileTab === "chat"
                ? "bg-[var(--nb-well)] text-[var(--nb-ink)] font-semibold"
                : "text-[var(--nb-ink-2)] hover:text-[var(--nb-ink)]"
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            data-testid="mobile-tab-studio"
            onClick={() => setActiveMobileTab("studio")}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
              activeMobileTab === "studio"
                ? "bg-[var(--nb-well)] text-[var(--nb-ink)] font-semibold"
                : "text-[var(--nb-ink-2)] hover:text-[var(--nb-ink)]"
            }`}
          >
            Studio
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // DESKTOP VIEW (>=768px, 14px outer margins, floating rounded-2xl cards)
  // -------------------------------------------------------------------------
  return (
    <div
      className={`relative flex h-screen w-screen overflow-hidden bg-[var(--nb-ground)] p-[14px] text-[var(--nb-ink)] ${className}`}
    >
      {/* LEFT SHELF: Sources */}
      <aside
        data-testid="pane-sources"
        style={{ width: `${leftCollapsed ? 48 : leftWidth}px` }}
        className={`relative flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--nb-edge)] bg-[var(--nb-sheet)] shadow-xs transition-[width] duration-200 ease-out`}
      >
        {leftCollapsed ? (
          <div className="flex h-full w-full flex-col items-center py-3">
            <button
              type="button"
              data-testid="collapse-sources-btn"
              onClick={toggleLeftCollapse}
              aria-label="Expand Sources shelf (Mod+B)"
              title="Expand Sources shelf (Mod+B)"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nb-well)] text-xs font-semibold text-[var(--nb-ink)] hover:bg-[var(--nb-edge)]"
            >
              ⇥
            </button>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col overflow-hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--nb-edge)] px-4">
              <span className="text-xs font-semibold text-[var(--nb-ink)]">
                Sources
              </span>
              <button
                type="button"
                data-testid="collapse-sources-btn"
                onClick={toggleLeftCollapse}
                aria-label="Collapse Sources shelf (Mod+B)"
                title="Collapse Sources shelf (Mod+B)"
                className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-[var(--nb-ink-2)] hover:bg-[var(--nb-well)] hover:text-[var(--nb-ink)]"
              >
                ⇤
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">{sourcesSlot}</div>
          </div>
        )}
      </aside>

      {/* LEFT SPLITTER (Inter-card hitbox) */}
      <div
        data-testid="splitter-left"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize Sources shelf"
        aria-valuenow={leftWidth}
        aria-valuemin={MIN_LEFT_WIDTH}
        aria-valuemax={MAX_LEFT_WIDTH}
        onMouseDown={handleLeftMouseDown}
        onDoubleClick={resetLeftWidth}
        onKeyDown={handleLeftKeyDown}
        className="group relative flex w-3 shrink-0 cursor-col-resize select-none items-center justify-center bg-transparent focus-visible:outline-2 focus-visible:outline-[var(--nb-ink)] focus-visible:outline-offset-2"
        title="Drag to resize, double-click to snap reset"
      >
        <div className="h-8 w-1 rounded-full bg-[var(--nb-edge)] transition-colors group-hover:bg-[var(--nb-ink)]" />
      </div>

      {/* CENTER STAGE: Uncontained Conversation Canvas & Docked Composer */}
      <main
        data-testid="pane-center"
        className="relative flex h-full flex-1 min-w-[520px] flex-col overflow-hidden px-2"
      >
        {/* Scrollable Conversation Stream */}
        <div
          data-testid="center-scroll-container"
          className="flex-1 overflow-y-auto px-4 pb-[84px]"
        >
          <div className="mx-auto max-w-[62ch] py-4">{centerSlot}</div>
        </div>

        {/* Solid Bottom Composer Dock (Occlusion Prevention) */}
        {composerSlot && (
          <div className="absolute bottom-2 left-2 right-2 z-20">
            <div className="mx-auto max-w-[62ch] rounded-xl border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-2 shadow-xs">
              {composerSlot}
            </div>
          </div>
        )}
      </main>

      {/* RIGHT SPLITTER (Inter-card hitbox) */}
      <div
        data-testid="splitter-right"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize Studio shelf"
        aria-valuenow={rightWidth}
        aria-valuemin={MIN_RIGHT_WIDTH}
        aria-valuemax={MAX_RIGHT_WIDTH}
        onMouseDown={handleRightMouseDown}
        onDoubleClick={resetRightWidth}
        onKeyDown={handleRightKeyDown}
        className="group relative flex w-3 shrink-0 cursor-col-resize select-none items-center justify-center bg-transparent focus-visible:outline-2 focus-visible:outline-[var(--nb-ink)] focus-visible:outline-offset-2"
        title="Drag to resize, double-click to snap reset"
      >
        <div className="h-8 w-1 rounded-full bg-[var(--nb-edge)] transition-colors group-hover:bg-[var(--nb-ink)]" />
      </div>

      {/* RIGHT SHELF: Studio Catalog & Tools */}
      <aside
        data-testid="pane-studio"
        style={{ width: `${rightCollapsed ? 48 : rightWidth}px` }}
        className={`relative flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--nb-edge)] bg-[var(--nb-sheet)] shadow-xs transition-[width] duration-200 ease-out`}
      >
        {rightCollapsed ? (
          <div className="flex h-full w-full flex-col items-center py-3">
            <button
              type="button"
              data-testid="collapse-studio-btn"
              onClick={toggleRightCollapse}
              aria-label="Expand Studio shelf (Mod+])"
              title="Expand Studio shelf (Mod+])"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nb-well)] text-xs font-semibold text-[var(--nb-ink)] hover:bg-[var(--nb-edge)]"
            >
              ⇤
            </button>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col overflow-hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--nb-edge)] px-4">
              <span className="text-xs font-semibold text-[var(--nb-ink)]">
                Studio tools
              </span>
              <button
                type="button"
                data-testid="collapse-studio-btn"
                onClick={toggleRightCollapse}
                aria-label="Collapse Studio shelf (Mod+])"
                title="Collapse Studio shelf (Mod+])"
                className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-[var(--nb-ink-2)] hover:bg-[var(--nb-well)] hover:text-[var(--nb-ink)]"
              >
                ⇥
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">{studioSlot}</div>
          </div>
        )}
      </aside>
    </div>
  );
}
