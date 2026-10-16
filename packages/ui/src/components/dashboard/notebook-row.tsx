import * as React from "react";
import {
  DASHBOARD_COLUMNS_CONFIG,
  type DashboardColumnId,
  type NotebookSummary,
} from "@notebook/contracts";
import { NotebookEmblem } from "./notebook-emblem.js";
import { formatBytes, formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";

export interface NotebookRowProps
  extends Omit<React.HTMLAttributes<HTMLTableRowElement>, "onClick"> {
  notebook: NotebookSummary;
  onOpen?: ((id: string) => void) | undefined;
}

const CELL_CLASS =
  "px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-sm text-[var(--nb-ink)]";

/**
 * List-view row. Cells render from the single `DASHBOARD_COLUMNS_CONFIG`
 * (parent ticket 05, §5 reuse rule) — all 7 columns, same order as the
 * header the parent renders from the same config. Display-only; actions
 * come through `children`.
 */
const NotebookRow = React.forwardRef<HTMLTableRowElement, NotebookRowProps>(
  ({ className, notebook, onOpen, children, ...props }, ref) => {
    if (!notebook) return null;
    const renderCell = (column: DashboardColumnId): React.ReactNode => {
      switch (column) {
        case "emblem":
          return (
            <td key={column} className={cn(CELL_CLASS, "text-center")}>
              <NotebookEmblem />
            </td>
          );
        case "title":
          return (
            <td key={column} className={cn(CELL_CLASS, "font-medium")}>
              <button
                type="button"
                onClick={() => {
                  onOpen?.(notebook.id);
                }}
                className="hover:underline"
              >
                {notebook.title}
              </button>
            </td>
          );
        case "sourcesCount":
          return (
            <td key={column} className={CELL_CLASS}>
              {notebook.sourcesCount}
            </td>
          );
        case "artifactsCount":
          return (
            <td key={column} className={CELL_CLASS}>
              {notebook.artifactsCount}
            </td>
          );
        case "storageFootprint":
          return (
            <td key={column} className={CELL_CLASS}>
              {formatBytes(notebook.storageBytes)}
            </td>
          );
        case "lastUpdated":
          return (
            <td key={column} className={CELL_CLASS}>
              {formatRelativeTime(notebook.updatedAt)}
            </td>
          );
        case "actions":
          return (
            <td key={column} className={CELL_CLASS}>
              <div
                className="flex items-center gap-[var(--nb-space-1)]"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                {children}
              </div>
            </td>
          );
      }
    };

    return (
      <tr
        ref={ref}
        onClick={() => {
          onOpen?.(notebook.id);
        }}
        className={cn(
          "cursor-pointer transition-colors hover:bg-[var(--nb-well)]",
          className
        )}
        {...props}
      >
        {DASHBOARD_COLUMNS_CONFIG.map((column) => renderCell(column.id))}
      </tr>
    );
  }
);
NotebookRow.displayName = "NotebookRow";

export { NotebookRow };
