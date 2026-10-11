import * as React from "react";
import { Input } from "@notebook/ui";
import {
  type NotebookSummary,
  DASHBOARD_COLUMNS_CONFIG,
} from "@notebook/contracts";
import { formatBytes, formatRelativeTime } from "./formatters";
import { NotebookActionsMenu } from "./NotebookActionsMenu";

export interface NotebookTableProps {
  notebooks: NotebookSummary[];
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

export function NotebookTable({
  notebooks,
  onOpenNotebook,
  renamingId,
  renamingTitle,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onDuplicateNotebook,
  onDeleteNotebook,
}: NotebookTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--nb-r-sheet)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] shadow-xs">
      <table className="w-full text-left text-sm text-[var(--nb-ink)] border-collapse">
        <thead>
          <tr className="border-b border-[var(--nb-edge)]/60 bg-[var(--nb-well)]/40 text-xs font-semibold text-[var(--nb-ink-2)]">
            {DASHBOARD_COLUMNS_CONFIG.map((col) => (
              <th
                key={col.id}
                style={{ width: col.width }}
                className="py-3 px-4"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--nb-edge)]/40">
          {notebooks.map((nb) => {
            const isRenaming = renamingId === nb.id;

            return (
              <tr
                key={nb.id}
                data-testid={`notebook-row-${nb.id}`}
                onClick={() => {
                  if (!isRenaming) {
                    onOpenNotebook?.(nb.id);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-[var(--nb-well)]/30"
              >
                {/* 1. Emblem */}
                <td className="py-3 px-4 text-center text-base">📓</td>

                {/* 2. Title */}
                <td className="py-3 px-4 font-medium">
                  {isRenaming ? (
                    <div onClick={(e) => e.stopPropagation()}>
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
                        className="h-8 text-sm font-semibold max-w-xs"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid={`rename-trigger-${nb.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartRename?.(nb.id, nb.title);
                      }}
                      title="Click to rename"
                      className="text-left font-medium text-[var(--nb-ink)] hover:underline truncate max-w-sm block"
                    >
                      {nb.title}
                    </button>
                  )}
                </td>

                {/* 3. Sources Count */}
                <td className="py-3 px-4 text-xs text-[var(--nb-ink-2)]">
                  {nb.sourcesCount} sources
                </td>

                {/* 4. Artifacts Count */}
                <td className="py-3 px-4 text-xs text-[var(--nb-ink-2)]">
                  {nb.artifactsCount} artifacts
                </td>

                {/* 5. Storage Footprint */}
                <td className="py-3 px-4 text-xs text-[var(--nb-ink-2)]">
                  {formatBytes(nb.storageBytes)}
                </td>

                {/* 6. Last Updated */}
                <td className="py-3 px-4 text-xs text-[var(--nb-ink-3)]">
                  {formatRelativeTime(nb.updatedAt)}
                </td>

                {/* 7. Actions Menu */}
                <td className="py-3 px-4 text-right">
                  <NotebookActionsMenu
                    notebookId={nb.id}
                    onRename={() => onStartRename?.(nb.id, nb.title)}
                    onDuplicate={() => onDuplicateNotebook?.(nb.id)}
                    onDelete={() => onDeleteNotebook?.(nb.id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
