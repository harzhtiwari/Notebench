import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from "@notebook/ui";

export interface NotebookActionsMenuProps {
  notebookId: string;
  onRename?: (() => void) | undefined;
  onDuplicate?: (() => void) | undefined;
  onExportZip?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

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
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-7 p-0 text-xs text-[var(--nb-ink-2)]"
        >
          ⋮
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          data-testid={`action-rename-${notebookId}`}
          onClick={(e) => {
            e.stopPropagation();
            onRename?.();
          }}
          className="text-xs cursor-pointer"
        >
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`action-duplicate-${notebookId}`}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate?.();
          }}
          className="text-xs cursor-pointer"
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`action-export-${notebookId}`}
          onClick={(e) => {
            e.stopPropagation();
            onExportZip?.();
          }}
          className="text-xs cursor-pointer opacity-70"
        >
          Export ZIP
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid={`action-delete-${notebookId}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="text-xs text-[var(--nb-danger)] focus:text-[var(--nb-danger)] cursor-pointer"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
