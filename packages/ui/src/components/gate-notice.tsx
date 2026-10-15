import * as React from "react";
import { Button } from "./button.js";
import { Download, Warning, CheckCircle } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface GateNoticeProps {
  /** Whether the export has completed in this session. When false, deletion is locked. */
  exported: boolean;
  /** Trigger callback for 1-click export (PRD K9). */
  onExport?: (() => void) | undefined;
  /** Custom title for the notice banner. */
  title?: string | undefined;
  /** Custom description for the notice banner. */
  description?: string | undefined;
  /** Whether the export operation is currently in flight. */
  isExporting?: boolean | undefined;
  /** Button label for export action. Defaults to "Export Everything (ZIP)". */
  exportButtonLabel?: string | undefined;
  /** Optional acknowledgment state for bypassing export (Decision 7.7). */
  acknowledged?: boolean | undefined;
  /** Optional callback when acknowledgment checkbox is toggled. */
  onAcknowledgeChange?: ((acknowledged: boolean) => void) | undefined;
  /** Custom children or secondary actions. */
  children?: React.ReactNode | undefined;
  /** Additional container classes (using var(--nb-*) only). */
  className?: string | undefined;
}

/**
 * GateNotice (Issue 22 / Ticket 23): Export-first gating banner (PRD K9, Decision 7.7).
 * Locks destructive actions until a backup has been exported or acknowledged.
 * Invariant: Never color-alone — pairs status colors with explicit icons and descriptive text.
 * Invariant: Elevation shadow invariant — zero float shadows on in-page banners.
 */
export function GateNotice({
  exported,
  onExport,
  title,
  description,
  isExporting = false,
  exportButtonLabel = "Export Everything (ZIP)",
  acknowledged = false,
  onAcknowledgeChange,
  children,
  className,
}: GateNoticeProps): React.JSX.Element {
  if (exported) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "banner banner--ok flex flex-col gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border border-[var(--nb-ok)] bg-[var(--nb-ok-wash)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
          className
        )}
      >
        <div className="flex items-start justify-between gap-[var(--nb-space-3)]">
          <div className="flex items-start gap-[var(--nb-space-3)]">
            <CheckCircle
              size={20}
              className="mt-[var(--nb-space-0-5)] shrink-0 text-[var(--nb-ok)]"
              aria-hidden="true"
            />
            <div className="space-y-[var(--nb-space-1)]">
              <h4 className="font-semibold text-[var(--nb-text-sm)]">
                {title ?? "Export completed"}
              </h4>
              <p className="text-[var(--nb-ink-2)] text-[var(--nb-text-xs)]">
                {description ??
                  "Workspace backup is complete. Deletion controls are unlocked."}
              </p>
            </div>
          </div>
          {onExport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={isExporting}
              className="shrink-0 gap-[var(--nb-space-2)]"
            >
              <Download size={16} aria-hidden="true" />
              {isExporting ? "Exporting..." : "Re-export Backup"}
            </Button>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "banner banner--warn flex flex-col gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border border-[var(--nb-warn)] bg-[var(--nb-warn-wash)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
        className
      )}
    >
      <div className="flex flex-col justify-between gap-[var(--nb-space-3)] sm:flex-row sm:items-center">
        <div className="flex items-start gap-[var(--nb-space-3)]">
          <Warning
            size={20}
            className="mt-[var(--nb-space-0-5)] shrink-0 text-[var(--nb-warn)]"
            aria-hidden="true"
          />
          <div className="space-y-[var(--nb-space-1)]">
            <h4 className="font-semibold text-[var(--nb-text-sm)]">
              {title ?? "Export required before deletion"}
            </h4>
            <p className="text-[var(--nb-ink-2)] text-[var(--nb-text-xs)]">
              {description ??
                "All destructive deletion actions are locked until a full workspace export has completed in this session."}
            </p>
          </div>
        </div>
        {onExport && (
          <Button
            type="button"
            variant="secondary"
            onClick={onExport}
            disabled={isExporting}
            className="shrink-0 gap-[var(--nb-space-2)]"
          >
            <Download size={16} aria-hidden="true" />
            {isExporting ? "Exporting..." : exportButtonLabel}
          </Button>
        )}
      </div>

      {onAcknowledgeChange && (
        <div className="pt-[var(--nb-space-1)]">
          <label className="flex cursor-pointer items-center gap-[var(--nb-space-2)] text-[var(--nb-ink-2)] text-[var(--nb-text-xs)]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => onAcknowledgeChange(e.target.checked)}
              className="rounded-[var(--nb-radius-xs)] border-[var(--nb-hairline)]"
            />
            <span>
              I have already backed up this data or do not require an export
            </span>
          </label>
        </div>
      )}

      {children}
    </div>
  );
}
