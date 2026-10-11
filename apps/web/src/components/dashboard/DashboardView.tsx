"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  type NotebookSummary,
  type DashboardMetrics,
  type DashboardSortKey,
  DASHBOARD_SORT_KEYS_CONFIG,
} from "@notebook/contracts";
import { Button, Input } from "@notebook/ui";
import { NoModelBanner } from "./NoModelBanner";
import { FirstRunBlankState } from "./FirstRunBlankState";
import { MetricsPopover } from "./MetricsPopover";
import { NotebookGrid } from "./NotebookGrid";
import { NotebookTable } from "./NotebookTable";

const VIEW_STORAGE_KEY = "notebench:dashboard:view";

export interface DashboardViewProps {
  notebooks: NotebookSummary[];
  metrics?: DashboardMetrics | undefined;
  hasConfiguredModel?: boolean | undefined;
  defaultView?: "grid" | "list" | undefined;
  onCreateNotebook?: (() => void) | undefined;
  onOpenNotebook?: ((id: string) => void) | undefined;
  onRenameNotebook?: ((id: string, newTitle: string) => Promise<void> | void) | undefined;
  onDuplicateNotebook?: ((id: string) => Promise<void> | void) | undefined;
  onDeleteNotebook?: ((id: string) => Promise<void> | void) | undefined;
  onOpenSettings?: ((page?: string) => void) | undefined;
}

export function DashboardView({
  notebooks,
  metrics = {
    storageUsedBytes: 0,
    storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
    notebookCount: notebooks.length,
    sourceCount: 0,
    artifactCount: 0,
  },
  hasConfiguredModel = false,
  defaultView = "grid",
  onCreateNotebook,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onDeleteNotebook,
  onOpenSettings,
}: DashboardViewProps) {
  // SSR-safe view mode persistence (Decision 1.25)
  const [viewMode, setViewMode] = useState<"grid" | "list">(defaultView);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<DashboardSortKey>("updated");

  // Inline rename state (Decision 1.18)
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "grid" || saved === "list") {
        setViewMode(saved);
      }
    } catch {
      // Ignore localStorage access failures in restricted environments
    }
  }, []);

  const handleSetViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Ignore
    }
  };

  const handleStartRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenamingTitle(currentTitle);
    setOriginalTitle(currentTitle);
  };

  const handleCommitRename = async () => {
    if (!renamingId) return;
    const trimmed = renamingTitle.trim();
    const id = renamingId;

    // Reset local rename UI immediately
    setRenamingId(null);

    // Empty value reverts without saving (Decision 1.18)
    if (!trimmed || trimmed === originalTitle) {
      return;
    }

    try {
      await onRenameNotebook?.(id, trimmed);
    } catch {
      // Non-fatal, UI maintains state
    }
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenamingTitle("");
    setOriginalTitle("");
  };

  // Filter and sort notebooks (Decisions 1.35 & PRD B7)
  const filteredAndSortedNotebooks = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    // 1. Filter by title and source filenames (Decision 1.35)
    let list = notebooks;
    if (trimmedQuery) {
      list = list.filter((nb) => {
        const titleMatch = nb.title.toLowerCase().includes(trimmedQuery);
        if (titleMatch) return true;
        const sourceMatch = nb.sourceFileNames.some((fn) =>
          fn.toLowerCase().includes(trimmedQuery)
        );
        return sourceMatch;
      });
    }

    // 2. Sort by selected key
    const sortConfig = DASHBOARD_SORT_KEYS_CONFIG.find((s) => s.id === sortKey);
    const direction = sortConfig?.defaultDirection ?? "desc";
    const modifier = direction === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "updated": {
          const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          return diff * modifier;
        }
        case "created": {
          const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          return diff * modifier;
        }
        case "title": {
          const diff = a.title.localeCompare(b.title);
          return diff * modifier;
        }
        case "size": {
          const diff = (a.storageBytes ?? 0) - (b.storageBytes ?? 0);
          return diff * modifier;
        }
        default:
          return 0;
      }
    });
  }, [notebooks, searchQuery, sortKey]);

  // First-run blank state: 0 notebooks and no search query (Decision 1.36, B10)
  if (notebooks.length === 0 && !searchQuery.trim()) {
    return (
      <main className="min-h-screen bg-[var(--nb-ground)] p-6">
        {!hasConfiguredModel && <NoModelBanner onOpenSettings={onOpenSettings} />}
        <FirstRunBlankState onCreateNotebook={onCreateNotebook} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--nb-ground)] p-6 text-[var(--nb-ink)]">
      {/* 1. Model Warning Banner (PRD B8) */}
      {!hasConfiguredModel && <NoModelBanner onOpenSettings={onOpenSettings} />}

      {/* 2. Top Header Toolbar */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--nb-edge)]/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--nb-r-control)] bg-[var(--nb-sheet)] text-base font-bold shadow-xs">
            ▲
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--nb-ink)]">
            Notebench
          </h1>
          <span className="text-xs text-[var(--nb-ink-3)] font-mono">v0.1</span>
        </div>

        {/* Search, Filter, Sort & View Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Real-time search input */}
          <div className="w-64">
            <Input
              type="search"
              placeholder="Search notebooks or source files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs bg-[var(--nb-sheet)] border-[var(--nb-edge)]"
            />
          </div>

          {/* Sort key selector */}
          <div className="flex items-center">
            <select
              data-testid="sort-select"
              aria-label="Sort notebooks"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as DashboardSortKey)}
              className="h-8 rounded-[var(--nb-r-control)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-2 text-xs font-medium text-[var(--nb-ink)] focus:outline-hidden"
            >
              {DASHBOARD_SORT_KEYS_CONFIG.map((sortOption) => (
                <option key={sortOption.id} value={sortOption.id}>
                  {sortOption.label}
                </option>
              ))}
            </select>
          </div>

          {/* Grid / List toggle buttons */}
          <div className="flex items-center rounded-[var(--nb-r-control)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-0.5">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              data-testid="view-toggle-grid"
              aria-label="Grid View"
              onClick={() => handleSetViewMode("grid")}
              className={`h-7 px-2.5 text-xs font-medium border-0 ${
                viewMode === "grid"
                  ? "bg-[var(--nb-well)] text-[var(--nb-ink)]"
                  : "bg-transparent text-[var(--nb-ink-2)]"
              }`}
            >
              Grid
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              data-testid="view-toggle-list"
              aria-label="List View"
              onClick={() => handleSetViewMode("list")}
              className={`h-7 px-2.5 text-xs font-medium border-0 ${
                viewMode === "list"
                  ? "bg-[var(--nb-well)] text-[var(--nb-ink)]"
                  : "bg-transparent text-[var(--nb-ink-2)]"
              }`}
            >
              List
            </Button>
          </div>

          {/* Metrics Popover (Decision 1.34) */}
          <MetricsPopover
            metrics={metrics}
            onManageStorage={() => onOpenSettings?.("storage")}
          />

          {/* Primary Create Button */}
          <Button
            size="sm"
            onClick={onCreateNotebook}
            className="h-8 px-3 text-xs font-semibold"
          >
            + New Notebook
          </Button>
        </div>
      </header>

      {/* 3. Empty Search Results State (Decision 1.35) */}
      {filteredAndSortedNotebooks.length === 0 && searchQuery.trim() ? (
        <div className="my-16 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-[var(--nb-ink-2)]">
            No notebooks match &apos;{searchQuery}&apos;
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="mt-3 h-8 text-xs font-medium text-[var(--nb-ink)]"
          >
            Clear search
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <NotebookGrid
          notebooks={filteredAndSortedNotebooks}
          onCreateNotebook={onCreateNotebook}
          onOpenNotebook={onOpenNotebook}
          renamingId={renamingId}
          renamingTitle={renamingTitle}
          onStartRename={handleStartRename}
          onRenameChange={setRenamingTitle}
          onCommitRename={handleCommitRename}
          onCancelRename={handleCancelRename}
          onDuplicateNotebook={onDuplicateNotebook}
          onDeleteNotebook={onDeleteNotebook}
        />
      ) : (
        <NotebookTable
          notebooks={filteredAndSortedNotebooks}
          onOpenNotebook={onOpenNotebook}
          renamingId={renamingId}
          renamingTitle={renamingTitle}
          onStartRename={handleStartRename}
          onRenameChange={setRenamingTitle}
          onCommitRename={handleCommitRename}
          onCancelRename={handleCancelRename}
          onDuplicateNotebook={onDuplicateNotebook}
          onDeleteNotebook={onDeleteNotebook}
        />
      )}
    </main>
  );
}
