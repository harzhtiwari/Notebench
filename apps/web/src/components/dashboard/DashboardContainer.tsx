"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import type { NotebookSummary, DashboardMetrics, SettingsPageId } from "@notebook/contracts";
import { DashboardView } from "./DashboardView";
import { SettingsDialog } from "../settings";

export function DashboardContainer() {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | undefined>(undefined);
  const [hasConfiguredModel, setHasConfiguredModel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsActivePage, setSettingsActivePage] = useState<SettingsPageId | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      const [notebooksRes, metricsRes] = await Promise.all([
        fetch("/api/notebooks"),
        fetch("/api/notebooks/metrics"),
      ]);

      if (notebooksRes.ok) {
        const data = (await notebooksRes.json()) as { notebooks: NotebookSummary[] };
        setNotebooks(data.notebooks);
      }

      if (metricsRes.ok) {
        const data = (await metricsRes.json()) as { metrics: DashboardMetrics };
        setMetrics(data.metrics);
      }

      if (typeof window !== "undefined") {
        const configured = localStorage.getItem("notebench:model:configured") === "true";
        setHasConfiguredModel(configured);
      }
    } catch {
      // In offline / preview environments, maintain local state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateNotebook = async () => {
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Notebook" }),
      });

      if (res.ok) {
        const data = (await res.json()) as { notebook: { id: string } };
        // Open the newly created notebook (Decision 1.23, B2)
        window.location.href = `/notebooks/${data.notebook.id}`;
      } else {
        await loadData();
      }
    } catch {
      // Fallback: reload list
      await loadData();
    }
  };

  const handleOpenNotebook = (id: string) => {
    window.location.href = `/notebooks/${id}`;
  };

  const handleRenameNotebook = async (id: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.ok) {
        setNotebooks((prev) =>
          prev.map((nb) =>
            nb.id === id ? { ...nb, title: newTitle, updatedAt: new Date().toISOString() } : nb
          )
        );
      }
    } catch {
      await loadData();
    }
  };

  const handleDuplicateNotebook = async (id: string) => {
    try {
      const res = await fetch(`/api/notebooks/${id}/duplicate`, {
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
  };

  const handleDeleteNotebook = async (id: string) => {
    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setNotebooks((prev) => prev.filter((nb) => nb.id !== id));
      }
    } catch {
      await loadData();
    }
  };

  const handleOpenSettings = (page?: string) => {
    setSettingsActivePage(page as SettingsPageId | undefined);
    setIsSettingsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--nb-ground)] text-[var(--nb-ink)]">
        <span className="text-sm font-medium">Loading workspace...</span>
      </div>
    );
  }

  return (
    <>
      <DashboardView
        notebooks={notebooks}
        metrics={metrics}
        hasConfiguredModel={hasConfiguredModel}
        onCreateNotebook={handleCreateNotebook}
        onOpenNotebook={handleOpenNotebook}
        onRenameNotebook={handleRenameNotebook}
        onDuplicateNotebook={handleDuplicateNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        onOpenSettings={handleOpenSettings}
      />
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        initialPage={settingsActivePage ?? "account"}
      />
    </>
  );
}
