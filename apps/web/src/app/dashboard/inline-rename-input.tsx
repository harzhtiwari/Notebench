"use client";

import { useState } from "react";
import { Input } from "@notebook/ui";

export interface InlineRenameInputProps {
  notebookId: string;
  initialTitle: string;
  onCommit: ((title: string) => void) | undefined;
  onCancel: (() => void) | undefined;
}

/**
 * Inline rename editor (Decision 1.18): saves on Enter or blur through the
 * caller; Escape and empty values revert without saving. Composes the shared
 * Input — the ui kit carries no rename-editing state, so only this editing
 * affordance lives here.
 */
export function InlineRenameInput({
  notebookId,
  initialTitle,
  onCommit,
  onCancel,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialTitle);

  function commit(): void {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === initialTitle) {
      onCancel?.();
      return;
    }
    onCommit?.(trimmed);
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Input
        autoFocus
        aria-label="Notebook title"
        data-testid={`inline-rename-input-${notebookId}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel?.();
          }
        }}
        onBlur={() => commit()}
        className="h-8 max-w-xs text-sm font-semibold"
      />
    </div>
  );
}
