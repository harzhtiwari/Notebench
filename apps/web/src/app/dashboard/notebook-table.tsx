"use client";

import type { NotebookSummary } from "@notebook/contracts";
import { DASHBOARD_COLUMNS_CONFIG } from "@notebook/contracts";
import { NotebookRow } from "@notebook/ui";
import { NotebookActionsMenu } from "./notebook-actions-menu";
import { InlineRenameInput } from "./inline-rename-input";
import type { NotebookActionCallbacks } from "./notebook-actions";

export interface NotebookTableProps extends NotebookActionCallbacks {
  notebooks: NotebookSummary[];
  renamingId?: string | null | undefined;
}

/**
 * List view (Decision 1.25): semantic table, header and rows rendered from
 * the single DASHBOARD_COLUMNS_CONFIG. The renaming row swaps to the inline
 * editor across all 7 columns — an editing state, not a row variant.
 */
export function NotebookTable({
  notebooks,
  renamingId = null,
  onOpenNotebook,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicateNotebook,
  onExportZip,
  onDeleteNotebook,
}: NotebookTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)]">
      <table
        aria-label="Notebooks"
        className="w-full border-collapse text-left text-sm text-[var(--nb-ink)]"
      >
        <thead>
          <tr className="border-b border-[var(--nb-hairline)] bg-[var(--nb-well)] text-xs font-semibold text-[var(--nb-ink-2)]">
            {DASHBOARD_COLUMNS_CONFIG.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.width === undefined ? undefined : { width: column.width }}
                className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notebooks.map((notebook) =>
            renamingId === notebook.id ? (
              <tr key={notebook.id}>
                <td
                  colSpan={DASHBOARD_COLUMNS_CONFIG.length}
                  className="px-[var(--nb-space-3)] py-[var(--nb-space-2)]"
                >
                  <InlineRenameInput
                    notebookId={notebook.id}
                    initialTitle={notebook.title}
                    onCommit={(title) => onCommitRename?.(notebook.id, title)}
                    onCancel={onCancelRename}
                  />
                </td>
              </tr>
            ) : (
              <NotebookRow
                key={notebook.id}
                data-testid={`notebook-row-${notebook.id}`}
                notebook={notebook}
                onOpen={onOpenNotebook}
              >
                <NotebookActionsMenu
                  notebookId={notebook.id}
                  onRename={() => onStartRename?.(notebook.id, notebook.title)}
                  onDuplicate={() => onDuplicateNotebook?.(notebook.id)}
                  onExportZip={() => onExportZip?.(notebook.id)}
                  onDelete={() => onDeleteNotebook?.(notebook.id)}
                />
              </NotebookRow>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
