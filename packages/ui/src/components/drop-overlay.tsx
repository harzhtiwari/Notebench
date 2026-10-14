import * as React from "react";
import { Upload } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface DropOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible only while a drag hovers the modal. Renders nothing when false. */
  active: boolean;
}

/**
 * Ingest drop feedback (ticket 08). The board defines no `.drop` class, so
 * this composes scrim + well + hairline tokens. Presentational only — the
 * parent owns drag events and the actual file handling.
 */
const DropOverlay = React.forwardRef<HTMLDivElement, DropOverlayProps>(
  ({ className, active, ...props }, ref) => {
    if (!active) {
      return null;
    }
    return (
      <div
        ref={ref}
        role="status"
        className={cn(
          "absolute inset-0 z-10 grid place-items-center rounded-[var(--nb-radius-modal)] bg-[var(--nb-scrim)] p-[var(--nb-space-4)]",
          className
        )}
        {...props}
      >
        <div className="grid justify-items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-card)] border border-dashed border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-[var(--nb-space-6)] py-[var(--nb-space-8)] text-center text-[var(--nb-ink)]">
          <Upload size={24} aria-hidden="true" />
          <p className="text-sm font-semibold">Drop files to add sources</p>
          <p className="text-xs text-[var(--nb-ink-2)]">
            PDF, DOCX, TXT, MD up to the server limit.
          </p>
        </div>
      </div>
    );
  }
);
DropOverlay.displayName = "DropOverlay";

export { DropOverlay };
