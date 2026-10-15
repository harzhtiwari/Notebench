"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardMetrics, NotebookSummary } from "@notebook/contracts";
import { apiUrl } from "../../lib/api";
import { DashboardView } from "./dashboard-view";

const MODEL_FLAG_KEY = "notebench:model:configured";

function isNotebookListPayload(value: unknown): value is { notebooks: NotebookSummary[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "notebooks" in value &&
    Array.isArray((value as { notebooks: unknown }).notebooks)
  );
}

function isMetricsPayload(value: unknown): value is { metrics: DashboardMetrics } {
  return (
    typeof value === "object" &&
    value !== null &&
    "metrics" in value &&
    typeof (value as { metrics: unknown }).metrics === "object" &&
    (value as { metrics: unknown }).metrics !== null
  );
}

function isNotebookPayload(value: unknown): value is { notebook: { id: string } } {
  if (typeof value !== "object" || value === null || !("notebook" in value)) return false;
  const notebook = (value as { notebook: unknown }).notebook;
  return typeof notebook === "object" && notebook !== null && typeof (notebook as { id: unknown }).id === "string";
}

export interface DashboardContainerProps {
  navigate?: ((to: string) => void) | undefined;
}

/**
 * Dashboard data layer: loads notebooks + metrics from the daemon,
 * performs create/rename/duplicate/delete, and opens notebooks. Instant
 * create navigates into the new notebook (B2, 1.23).
 */
export function DashboardContainer({ navigate }: DashboardContainerProps = {}) {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | undefined>(undefined);
  const [hasConfiguredModel, setHasConfiguredModel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [notebooksRes, metricsRes] = await Promise.all([
        fetch(apiUrl("/api/notebooks")),
        fetch(apiUrl("/api/notebooks/metrics")),
      ]);
      if (notebooksRes.ok) {
        const data: unknown = await notebooksRes.json();
        if (isNotebookListPayload(data)) setNotebooks(data.notebooks);
      }
      if (metricsRes.ok) {
        const data: unknown = await metricsRes.json();
        if (isMetricsPayload(data)) setMetrics(data.metrics);
      }
    } catch {
      // Offline / booting daemon: keep local state.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      setHasConfiguredModel(window.localStorage.getItem(MODEL_FLAG_KEY) === "true");
    } catch {
      // Restricted storage keeps the banner visible.
    }
  }, []);

  function openNotebook(to: string): void {
    if (navigate !== undefined) {
      navigate(to);
      return;
    }
    window.location.href = to;
  }

  async function handleCreateNotebook(): Promise<void> {
    try {
      const res = await fetch(apiUrl("/api/notebooks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Notebook" }),
      });
      if (res.ok) {
        const data: unknown = await res.json();
        if (isNotebookPayload(data)) {
          openNotebook(`/notebooks/${data.notebook.id}`);
          return;
        }
      }
    } catch {
      // Fall through to a list reload.
    }
    await loadData();
  }

  function handleOpenNotebook(id: string): void {
    openNotebook(`/notebooks/${id}`);
  }

  async function handleRenameNotebook(id: string, title: string): Promise<void> {
    try {
      const res = await fetch(apiUrl(`/api/notebooks/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNotebooks((prev) =>
          prev.map((notebook) =>
            notebook.id === id
              ? { ...notebook, title, updatedAt: new Date().toISOString() }
              : notebook
          )
        );
        return;
      }
    } catch {
      // Fall through to a list reload.
    }
    await loadData();
  }

  async function handleDuplicateNotebook(id: string): Promise<void> {
    try {
      const res = await fetch(apiUrl(`/api/notebooks/${id}/duplicate`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      await loadData();
    }
  }

  async function handleDeleteNotebook(id: string): Promise<void> {
    try {
      const res = await fetch(apiUrl(`/api/notebooks/${id}`), {
        method: "DELETE",
      });
      if (res.ok) {
        setNotebooks((prev) => prev.filter((notebook) => notebook.id !== id));
        return;
      }
    } catch {
      // Fall through to a list reload.
    }
    await loadData();
  }

  function handleExportZip(id: string): void {
    const url = apiUrl(`/api/notebooks/${id}/export`);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.setAttribute("download", `notebook-${id}.zip`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] text-[var(--nb-ink)]">
        <span className="text-sm font-medium">Loading notebooks...</span>
      </main>
    );
  }

  return (
    <DashboardView
      notebooks={notebooks}
      metrics={metrics}
      hasConfiguredModel={hasConfiguredModel}
      onCreateNotebook={() => void handleCreateNotebook()}
      onOpenNotebook={handleOpenNotebook}
      onRenameNotebook={(id, title) => void handleRenameNotebook(id, title)}
      onDuplicateNotebook={(id) => void handleDuplicateNotebook(id)}
      onExportZip={handleExportZip}
      onDeleteNotebook={(id) => void handleDeleteNotebook(id)}
      onOpenSettings={() => {
        openNotebook("/settings");
      }}
    />
  );
}
