"use client";

import type { NotebookSummary } from "@notebook/contracts";
import { CreateCard, NotebookCard } from "@notebook/ui";
import { NotebookActionsMenu } from "./notebook-actions-menu";
import { InlineRenameInput } from "./inline-rename-input";
import type { NotebookActionCallbacks } from "./notebook-actions";

export interface NotebookGridProps extends NotebookActionCallbacks {
  notebooks: NotebookSummary[];
  renamingId?: string | null | undefined;
  onCreateNotebook?: (() => void) | undefined;
}

/**
 * Grid view: dashed create card fixed in slot 1 (Decision 1.26), then one
 * shared NotebookCard per notebook. The renaming item swaps to the inline
 * editor — an editing state the card does not carry, not a card variant.
 */
export function NotebookGrid({
  notebooks,
  renamingId = null,
  onCreateNotebook,
  onOpenNotebook,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicateNotebook,
  onExportZip,
  onDeleteNotebook,
}: NotebookGridProps) {
  return (
    <section
      data-testid="dashboard-grid"
      aria-label="Notebooks grid"
      className="grid gap-[var(--nb-space-4)] sm:grid-cols-2 lg:grid-cols-3"
    >
      <CreateCard onCreate={onCreateNotebook} />
      {notebooks.map((notebook) =>
        renamingId === notebook.id ? (
          <div
            key={notebook.id}
            className="flex min-h-[170px] flex-col justify-center rounded-[var(--nb-radius-card)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)]"
          >
            <InlineRenameInput
              notebookId={notebook.id}
              initialTitle={notebook.title}
              onCommit={(title) => onCommitRename?.(notebook.id, title)}
              onCancel={onCancelRename}
            />
          </div>
        ) : (
          <NotebookCard
            key={notebook.id}
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
          </NotebookCard>
        )
      )}
    </section>
  );
}
