"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DotsThreeVertical,
} from "@notebook/ui";

export interface NotebookActionsMenuProps {
  notebookId: string;
  onRename?: (() => void) | undefined;
  onDuplicate?: (() => void) | undefined;
  onExportZip?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

/**
 * Row/card actions menu (Decision 1.25: Rename, Duplicate, Export ZIP,
 * Delete). Composes the shared Radix dropdown — display only, every action
 * is a caller callback.
 */
export function NotebookActionsMenu({
  notebookId,
  onRename,
  onDuplicate,
  onExportZip,
  onDelete,
}: NotebookActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid={`actions-trigger-${notebookId}`}
          aria-label="Notebook actions"
          onClick={(event) => event.stopPropagation()}
          className="h-7 w-7 p-0 text-[var(--nb-ink-2)]"
        >
          <DotsThreeVertical size={16} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]"
      >
        <DropdownMenuItem
          data-testid={`action-rename-${notebookId}`}
          onClick={(event) => {
            event.stopPropagation();
            onRename?.();
          }}
          className="cursor-pointer text-xs"
        >
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`action-duplicate-${notebookId}`}
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate?.();
          }}
          className="cursor-pointer text-xs"
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`action-export-${notebookId}`}
          onClick={(event) => {
            event.stopPropagation();
            onExportZip?.();
          }}
          className="cursor-pointer text-xs"
        >
          Export ZIP
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid={`action-delete-${notebookId}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.();
          }}
          className="cursor-pointer text-xs text-[var(--nb-danger)] focus:text-[var(--nb-danger)]"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
