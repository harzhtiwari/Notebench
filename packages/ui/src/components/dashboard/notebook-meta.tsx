import * as React from "react";
import type { NotebookSummary } from "@notebench/contracts";
import { formatBytes, formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";

export interface NotebookMetaProps
  extends React.HTMLAttributes<HTMLDivElement> {
  notebook: NotebookSummary;
}

/**
 * Shared counts/footprint/updated line. One shape for `NotebookCard`,
 * `NotebookRow`, and the future trash surfaces — numbers always beside
 * labels, never bare.
 */
const NotebookMeta = React.forwardRef<HTMLDivElement, NotebookMetaProps>(
  ({ className, notebook, ...props }, ref) => {
    if (!notebook) return null;
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-wrap gap-x-[var(--nb-space-3)] gap-y-[var(--nb-space-1)] text-xs text-[var(--nb-ink-2)]",
          className
        )}
        {...props}
      >
        <span>{notebook.sourcesCount} sources</span>
        <span>{notebook.artifactsCount} artifacts</span>
        <span>{formatBytes(notebook.storageBytes)}</span>
        <span>{formatRelativeTime(notebook.updatedAt)}</span>
      </div>
    );
  }
);
NotebookMeta.displayName = "NotebookMeta";

export { NotebookMeta };
