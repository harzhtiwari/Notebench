"use client";

export interface NotebookActionCallbacks {
  onOpenNotebook?: ((id: string) => void) | undefined;
  onStartRename?: ((id: string, currentTitle: string) => void) | undefined;
  onCommitRename?: ((id: string, title: string) => void) | undefined;
  onCancelRename?: (() => void) | undefined;
  onDuplicateNotebook?: ((id: string) => void) | undefined;
  onExportZip?: ((id: string) => void) | undefined;
  onDeleteNotebook?: ((id: string) => void) | undefined;
}

export function createRenameHandlers(
  setRenamingId: (id: string | null) => void,
  onRenameNotebook: ((id: string, title: string) => void) | undefined,
): Pick<NotebookActionCallbacks, "onStartRename" | "onCommitRename" | "onCancelRename"> {
  return {
    onStartRename: (id) => setRenamingId(id),
    onCommitRename: (id, title) => {
      setRenamingId(null);
      onRenameNotebook?.(id, title);
    },
    onCancelRename: () => setRenamingId(null),
  };
}
