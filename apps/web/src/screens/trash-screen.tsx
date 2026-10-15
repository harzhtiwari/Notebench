"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  EmptyList,
  Trash,
  TrashRow,
  type TrashedItem,
} from "@notebook/ui";
import { apiUrl } from "../lib/api";

export interface TrashScreenProps {
  initialItems?: TrashedItem[] | undefined;
  onRestore?: ((id: string) => void | Promise<void>) | undefined;
  onPurge?: ((id: string) => void | Promise<void>) | undefined;
  onEmptyTrash?: (() => void | Promise<void>) | undefined;
  navigate?: ((to: string) => void) | undefined;
  reauthMode?: "none" | "phrase" | "passcode" | undefined;
}

/**
 * TrashScreen (Ticket 21: Trash Composition).
 *
 * Composes existing UI building blocks into the 30-day Trash view:
 * - Retention alert banner (AlertBanner) with 30-day soft trash warning
 * - Empty state (EmptyList) when no trashed items exist
 * - Trashed item table (TrashRow) with retention countdowns and paired actions
 * - Permanent purge and empty-trash confirmation dialogs (ConfirmDialog)
 *
 * Invariant (Rule 1.2): In-page elements must not have elevation shadows.
 * Invariant (Rule 1.6): Styling uses var(--nb-*) tokens only.
 */
export function TrashScreen({
  initialItems,
  onRestore,
  onPurge,
  onEmptyTrash,
  reauthMode,
}: TrashScreenProps) {
  const [items, setItems] = useState<TrashedItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(initialItems === undefined);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [purgeTarget, setPurgeTarget] = useState<TrashedItem | null>(null);
  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = useState(false);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Load trashed items if not provided via initialItems
  const loadTrash = useCallback(async () => {
    if (initialItems !== undefined) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/trash"));
      if (res.ok) {
        const data = (await res.json()) as { items?: TrashedItem[] };
        if (Array.isArray(data.items)) {
          setItems(data.items);
        }
      }
    } catch {
      // In tests or offline, preserve existing items
    } finally {
      setLoading(false);
    }
  }, [initialItems]);

  useEffect(() => {
    if (initialItems === undefined) {
      void loadTrash();
    }
  }, [loadTrash, initialItems]);

  // Helper for async trash mutations
  const runTrashAction = async (actionFn: () => Promise<void>, errorMessage: string) => {
    setIsActionPending(true);
    try {
      await actionFn();
    } catch {
      setError(errorMessage);
    } finally {
      setIsActionPending(false);
    }
  };

  // Restore action
  const handleRestore = async (id: string) => {
    await runTrashAction(async () => {
      if (onRestore) {
        await onRestore(id);
      } else {
        await fetch(apiUrl(`/api/trash/${id}/restore`), { method: "POST" });
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, "Failed to restore item.");
  };

  // Launch single purge dialog
  const handlePurgeClick = (id: string) => {
    const target = items.find((item) => item.id === id) ?? null;
    if (target) {
      setPurgeTarget(target);
      setIsPurgeDialogOpen(true);
    }
  };

  // Confirm single purge
  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    const targetId = purgeTarget.id;
    await runTrashAction(async () => {
      if (onPurge) {
        await onPurge(targetId);
      } else {
        await fetch(apiUrl(`/api/trash/${targetId}`), { method: "DELETE" });
      }
      setItems((prev) => prev.filter((item) => item.id !== targetId));
      setIsPurgeDialogOpen(false);
      setPurgeTarget(null);
    }, "Failed to permanently delete item.");
  };

  // Confirm empty trash
  const handleConfirmEmptyTrash = async () => {
    await runTrashAction(async () => {
      if (onEmptyTrash) {
        await onEmptyTrash();
      } else {
        await fetch(apiUrl("/api/trash"), { method: "DELETE" });
      }
      setItems([]);
      setIsEmptyTrashDialogOpen(false);
    }, "Failed to empty trash.");
  };

  return (
    <main className="min-h-screen bg-[var(--nb-ground)] p-[var(--nb-space-6)] text-[var(--nb-ink)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-[var(--nb-space-6)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-3)]">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--nb-ink)]">
              Trash
            </h1>
            <p className="text-sm text-[var(--nb-ink-2)]">
              Items in trash are automatically purged after 30 days.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[var(--nb-danger)] text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)] hover:text-[var(--nb-danger)]"
            disabled={items.length === 0 || isActionPending || loading}
            onClick={() => {
              setIsEmptyTrashDialogOpen(true);
            }}
          >
            <Trash size={16} aria-hidden="true" className="mr-[var(--nb-space-2)] shrink-0" />
            Empty Trash
          </Button>
        </div>

        {/* 30-Day Retention Notice Banner */}
        <AlertBanner
          tone="warn"
          title="30-day soft trash"
          message="Accidental deletes can be recovered for 30 days. Trashed items leave normal views and search at once, but their data stays until purge. After 30 days, items are permanently removed."
        />

        {/* Error message */}
        {error ? (
          <p className="text-sm text-[var(--nb-danger)]">{error}</p>
        ) : null}

        {/* Content: Empty state or Table */}
        {loading && items.length === 0 ? (
          <p className="text-sm text-[var(--nb-ink-2)]">Loading trash...</p>
        ) : items.length === 0 ? (
          <EmptyList
            title="Trash is empty"
            description="No deleted notebooks or sources. Items deleted from your workspace will appear here for 30 days before permanent removal."
            milestone={undefined}
          />
        ) : (
          <div className="rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--nb-hairline)] bg-[var(--nb-well)] text-xs font-semibold text-[var(--nb-ink-2)]">
                  <th className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]">
                    Name
                  </th>
                  <th className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]">
                    Type
                  </th>
                  <th className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]">
                    Trashed
                  </th>
                  <th className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]">
                    Days Remaining
                  </th>
                  <th className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    disabled={isActionPending}
                    onRestore={handleRestore}
                    onPurge={handlePurgeClick}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ConfirmDialog: Single Item Permanent Purge */}
      <ConfirmDialog
        open={isPurgeDialogOpen}
        onOpenChange={setIsPurgeDialogOpen}
        level={3}
        title="Delete Permanently"
        targetName={purgeTarget?.title}
        description={`Permanently delete "${purgeTarget?.title}"? All associated document chunks and vector embeddings will be permanently purged. This action cannot be undone.`}
        confirmLabel="Delete permanently"
        reauthMode={reauthMode}
        onExportBackup={() => {
          if (purgeTarget) {
            window.open(apiUrl(`/api/notebooks/${purgeTarget.id}/export`), "_blank");
          }
        }}
        isPending={isActionPending}
        onConfirm={handleConfirmPurge}
        onCancel={() => {
          setIsPurgeDialogOpen(false);
          setPurgeTarget(null);
        }}
      />

      {/* ConfirmDialog: Empty Trash */}
      <ConfirmDialog
        open={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        level={4}
        title="Empty Trash"
        description="Permanently delete all items currently in the trash? All trashed notebooks, sources, and vector embeddings will be permanently purged. This action cannot be undone."
        confirmLabel="Empty Trash"
        reauthMode={reauthMode}
        onExportBackup={() => {
          window.open(apiUrl("/api/export/all"), "_blank");
        }}
        isPending={isActionPending}
        onConfirm={handleConfirmEmptyTrash}
        onCancel={() => {
          setIsEmptyTrashDialogOpen(false);
        }}
      />
    </main>
  );
}
