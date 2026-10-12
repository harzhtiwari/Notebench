import * as React from "react";
import { Well, Input, Plus } from "@notebook/ui";
import type { NotebookSummary } from "@notebook/contracts";
import { formatBytes, formatRelativeTime } from "./formatters";
import { NotebookActionsMenu } from "./NotebookActionsMenu";

export interface NotebookGridProps {
  notebooks: NotebookSummary[];
  onCreateNotebook?: (() => void) | undefined;
  onOpenNotebook?: ((id: string) => void) | undefined;
  onRenameNotebook?: ((id: string, newTitle: string) => void) | undefined;
  onDuplicateNotebook?: ((id: string) => void) | undefined;
  onDeleteNotebook?: ((id: string) => void) | undefined;
  renamingId?: string | null | undefined;
  renamingTitle?: string | undefined;
  onStartRename?: ((id: string, currentTitle: string) => void) | undefined;
  onRenameChange?: ((val: string) => void) | undefined;
  onCommitRename?: (() => void) | undefined;
  onCancelRename?: (() => void) | undefined;
}

export function NotebookGrid({
  notebooks,
  onCreateNotebook,
  onOpenNotebook,
  renamingId,
  renamingTitle,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onDuplicateNotebook,
  onDeleteNotebook,
}: NotebookGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Slot 1: Fixed dashed "+ Create New Notebook" card (Decision 1.26) */}
      <div
        data-testid="slot1-create-notebook-card"
        onClick={onCreateNotebook}
        className="group flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-[var(--nb-r-sheet)] border-2 border-dashed border-[var(--nb-edge)] bg-[var(--nb-ground)]/50 p-6 text-center transition-colors hover:border-[var(--nb-ink-2)] hover:bg-[var(--nb-well)]/40"
      >
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-xs group-hover:scale-105 transition-transform">
          <Plus size={20} weight="bold" />
        </div>
        <span className="text-sm font-semibold text-[var(--nb-ink)]">
          Create New Notebook
        </span>
        <span className="mt-1 text-xs text-[var(--nb-ink-2)]">
          Instant blank research workspace
        </span>
      </div>

      {/* Notebook Cards */}
      {notebooks.map((nb) => {
        const isRenaming = renamingId === nb.id;

        return (
          <Well
            key={nb.id}
            data-testid={`notebook-card-${nb.id}`}
            onClick={() => {
              if (!isRenaming) {
                onOpenNotebook?.(nb.id);
              }
            }}
            className="flex min-h-[170px] cursor-pointer flex-col justify-between p-4 transition-all hover:border-[var(--nb-ink-2)] hover:shadow-xs"
          >
            <div>
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-xl">📓</span>
                <NotebookActionsMenu
                  notebookId={nb.id}
                  onRename={() => onStartRename?.(nb.id, nb.title)}
                  onDuplicate={() => onDuplicateNotebook?.(nb.id)}
                  onDelete={() => onDeleteNotebook?.(nb.id)}
                />
              </div>

              {isRenaming ? (
                <div onClick={(e) => e.stopPropagation()} className="mt-1">
                  <Input
                    autoFocus
                    data-testid={`inline-rename-input-${nb.id}`}
                    value={renamingTitle}
                    onChange={(e) => onRenameChange?.(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCommitRename?.();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        onCancelRename?.();
                      }
                    }}
                    onBlur={() => onCommitRename?.()}
                    className="h-8 text-sm font-semibold"
                  />
                </div>
              ) : (
                <h3
                  data-testid={`rename-trigger-${nb.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRename?.(nb.id, nb.title);
                  }}
                  title="Click to rename"
                  className="text-sm font-semibold text-[var(--nb-ink)] hover:underline truncate"
                >
                  {nb.title}
                </h3>
              )}
            </div>

            <div className="mt-4 border-t border-[var(--nb-edge)]/40 pt-2 text-xs text-[var(--nb-ink-2)] flex flex-col gap-1">
              <div className="flex justify-between">
                <span>{nb.sourcesCount} sources · {nb.artifactsCount} artifacts</span>
                <span>{formatBytes(nb.storageBytes)}</span>
              </div>
              <div className="text-[11px] text-[var(--nb-ink-3)]">
                Updated {formatRelativeTime(nb.updatedAt)}
              </div>
            </div>
          </Well>
        );
      })}
    </div>
  );
}
