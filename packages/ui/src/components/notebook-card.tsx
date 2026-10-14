import * as React from "react";
import type { NotebookSummary } from "@notebook/contracts";
import { NotebookEmblem } from "./notebook-emblem.js";
import { NotebookMeta } from "./notebook-meta.js";
import { cn } from "../lib/utils.js";

export interface NotebookCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  notebook: NotebookSummary;
  onOpen?: ((id: string) => void) | undefined;
}

/**
 * Grid card: emblem + title + shared meta + actions slot. Display-only —
 * rename/duplicate/delete UI is composed by the parent through `actions`.
 */
const NotebookCard = React.forwardRef<HTMLDivElement, NotebookCardProps>(
  ({ className, notebook, onOpen, children, ...props }, ref) => (
    <div
      ref={ref}
      onClick={() => {
        onOpen?.(notebook.id);
      }}
      className={cn(
        "flex min-h-[170px] cursor-pointer flex-col justify-between rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] transition-colors hover:border-[var(--nb-edge)]",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-[var(--nb-space-2)]">
        <NotebookEmblem />
        <div
          className="flex items-center gap-[var(--nb-space-1)]"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {children}
        </div>
      </div>
      <div className="grid gap-[var(--nb-space-2)]">
        <button
          type="button"
          onClick={() => {
            onOpen?.(notebook.id);
          }}
          className="justify-self-start text-left text-sm font-semibold text-[var(--nb-ink)] hover:underline"
        >
          {notebook.title}
        </button>
        <NotebookMeta notebook={notebook} />
      </div>
    </div>
  )
);
NotebookCard.displayName = "NotebookCard";

export { NotebookCard };
