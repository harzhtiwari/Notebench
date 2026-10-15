"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_SORT_KEYS_CONFIG,
  type DashboardMetrics,
  type DashboardSortKey,
  type NotebookSummary,
} from "@notebook/contracts";
import {
  Button,
  FirstRunBlankState,
  formatBytes,
  MetricRow,
  MetricsPopover,
  NoModelBanner,
  SearchInput,
  SortSelect,
  ViewToggle,
  type DashboardView as DashboardViewMode,
} from "@notebook/ui";
import { NotebookGrid } from "./notebook-grid";
import { NotebookTable } from "./notebook-table";
import { createRenameHandlers } from "./notebook-actions";

const VIEW_STORAGE_KEY = "notebench:dashboard:view";

const DEFAULT_METRICS: DashboardMetrics = {
  storageUsedBytes: 0,
  storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
  notebookCount: 0,
  sourceCount: 0,
  artifactCount: 0,
};

export interface DashboardViewProps {
  notebooks: NotebookSummary[];
  metrics?: DashboardMetrics | undefined;
  hasConfiguredModel?: boolean | undefined;
  defaultView?: DashboardViewMode | undefined;
  onCreateNotebook?: (() => void) | undefined;
  onOpenNotebook?: ((id: string) => void) | undefined;
  onRenameNotebook?: ((id: string, title: string) => void) | undefined;
  onDuplicateNotebook?: ((id: string) => void) | undefined;
  onExportZip?: ((id: string) => void) | undefined;
  onDeleteNotebook?: ((id: string) => void) | undefined;
  onOpenSettings?: ((page?: string) => void) | undefined;
}

/** Instant client filter across title + ingested source filenames (1.35). */
function applyDashboardFilter(notebooks: NotebookSummary[], query: string): NotebookSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return notebooks;
  return notebooks.filter(
    (notebook) =>
      notebook.title.toLowerCase().includes(trimmed) ||
      notebook.sourceFileNames.some((filename) => filename.toLowerCase().includes(trimmed))
  );
}

/** Client sort by updated, created, title, or size (B7). */
function applyDashboardSort(notebooks: NotebookSummary[], sortKey: DashboardSortKey): NotebookSummary[] {
  const direction = DASHBOARD_SORT_KEYS_CONFIG.find((s) => s.id === sortKey)?.defaultDirection ?? "desc";
  const modifier = direction === "asc" ? 1 : -1;
  return [...notebooks].sort((a, b) => {
    switch (sortKey) {
      case "updated":
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * modifier;
      case "created":
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * modifier;
      case "title":
        return a.title.localeCompare(b.title) * modifier;
      case "size":
        return ((a.storageBytes ?? 0) - (b.storageBytes ?? 0)) * modifier;
    }
  });
}

/**
 * Dashboard composition (ticket 05): toolbar (search, sort, view toggle,
 * metrics popover, create), model banner, blank/first-run/empty states, and
 * the grid or list view. Every visual is a shared @notebook/ui primitive —
 * this file only composes and wires.
 */
export function DashboardView({
  notebooks,
  metrics = DEFAULT_METRICS,
  hasConfiguredModel = false,
  defaultView = "grid",
  onCreateNotebook,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onExportZip,
  onDeleteNotebook,
  onOpenSettings,
}: DashboardViewProps) {
  const [view, setView] = useState<DashboardViewMode>(defaultView);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<DashboardSortKey>("updated");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameHandlers = createRenameHandlers(setRenamingId, onRenameNotebook);

  // SSR-safe view persistence (1.25): read only in the browser, never render.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // Private mode / restricted environments keep the default view.
    }
  }, []);

  function handleSetView(next: DashboardViewMode): void {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort.
    }
  }

  const visibleNotebooks = useMemo(
    () => applyDashboardSort(applyDashboardFilter(notebooks, searchQuery), sortKey),
    [notebooks, searchQuery, sortKey]
  );

  const storageFraction =
    metrics.storageSafeCapBytes > 0 ? metrics.storageUsedBytes / metrics.storageSafeCapBytes : 0;

  // First-run blank state: zero notebooks, no query (1.36). No sample data.
  if (notebooks.length === 0 && searchQuery.trim().length === 0) {
    return (
      <main className="min-h-screen bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
        {!hasConfiguredModel ? <NoModelBanner onOpenSettings={onOpenSettings} /> : null}
        <FirstRunBlankState onCreateNotebook={onCreateNotebook} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
      {!hasConfiguredModel ? <NoModelBanner onOpenSettings={onOpenSettings} /> : null}

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--nb-hairline)] pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--nb-ink)]">Notebench</h1>
          <span className="font-mono text-xs text-[var(--nb-ink-3)]">v0.1</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            aria-label="Search notebooks"
            placeholder="Search notebooks or source files..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-64"
          />
          <SortSelect
            aria-label="Sort notebooks"
            value={sortKey}
            onChange={(key) => setSortKey(key)}
          />
          <ViewToggle value={view} onChange={(next) => handleSetView(next)} />
          <MetricsPopover metrics={metrics} onManageStorage={() => onOpenSettings?.("storage")} />
          <Button size="sm" onClick={onCreateNotebook} className="h-8 px-3 text-xs font-semibold">
            + New Notebook
          </Button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3" data-testid="storage-summary">
        <div className="min-w-64 flex-1">
          <MetricRow
            label="Storage Used"
            value={`${formatBytes(metrics.storageUsedBytes)} / 5.0 GB Safe Cap`}
            fraction={storageFraction}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenSettings?.("storage")}
          className="h-8 text-xs font-medium"
        >
          Storage &amp; Data
        </Button>
      </div>

      {visibleNotebooks.length === 0 ? (
        <div className="my-16 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-[var(--nb-ink-2)]">
            No notebooks match &apos;{searchQuery.trim()}&apos;
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
      ) : view === "grid" ? (
        <NotebookGrid
          notebooks={visibleNotebooks}
          renamingId={renamingId}
          onCreateNotebook={onCreateNotebook}
          onOpenNotebook={onOpenNotebook}
          onStartRename={renameHandlers.onStartRename}
          onCommitRename={renameHandlers.onCommitRename}
          onCancelRename={renameHandlers.onCancelRename}
          onDuplicateNotebook={onDuplicateNotebook}
          onExportZip={onExportZip}
          onDeleteNotebook={onDeleteNotebook}
        />
      ) : (
        <NotebookTable
          notebooks={visibleNotebooks}
          renamingId={renamingId}
          onOpenNotebook={onOpenNotebook}
          onStartRename={renameHandlers.onStartRename}
          onCommitRename={renameHandlers.onCommitRename}
          onCancelRename={renameHandlers.onCancelRename}
          onDuplicateNotebook={onDuplicateNotebook}
          onExportZip={onExportZip}
          onDeleteNotebook={onDeleteNotebook}
        />
      )}
    </main>
  );
}
