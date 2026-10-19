import * as React from "react";

import { Banner } from "../primitives/banners.js";
import { Button } from "../primitives/button.js";
import { Checkbox } from "../primitives/fields.js";
import { DownloadIcon } from "../primitives/icons.js";

export interface GateNoticeProps {
  /**
  Whether the export has completed in this session. When false, deletion is locked.
  */
  exported: boolean;
  /**
  Trigger callback for 1-click export (PRD K9).
  */
  onExport?: (() => void) | undefined;
  /**
  Custom title for the notice banner.
  */
  title?: string | undefined;
  /**
  Custom description for the notice banner.
  */
  description?: string | undefined;
  /**
  Whether the export operation is currently in flight.
  */
  isExporting?: boolean | undefined;
  /**
  Button label for export action. Defaults to "Export Everything (ZIP)".
  */
  exportButtonLabel?: string | undefined;
  /**
  Optional acknowledgment state for bypassing export (Decision 7.7).
  */
  acknowledged?: boolean | undefined;
  /**
  Optional callback when acknowledgment checkbox is toggled.
  */
  onAcknowledgeChange?: ((isAcknowledged: boolean) => void) | undefined;
  /**
  Custom children or secondary actions.
  */
  children?: React.ReactNode | undefined;
  /**
  Additional container classes (using var(--nb-*) only).
  */
  className?: string | undefined;
}

/**
GateNotice (Issue 22 / Ticket 23): Export-first gating banner (PRD K9, Decision 7.7).
Locks destructive actions until a backup has been exported or acknowledged.
Composed on the unified Banner primitive.
Invariant: Never color-alone — pairs status colors with explicit icons and descriptive text.
Invariant: Elevation shadow invariant — zero float shadows on in-page banners.
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
      <Banner
        tone="ok"
        title={title ?? "Export completed"}
        message={
          description ??
          "Workspace backup is complete. Deletion controls are unlocked."
        }
        className={className}
      >
        {onExport ? (
          <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
            <Button
              type="button"
              variant="nb_btn_secondary"
              size="nb_btn_sm"
              onClick={onExport}
              disabled={isExporting}
              leadingIcon={DownloadIcon}
            >
              {isExporting ? "Exporting..." : "Re-export Backup"}
            </Button>
          </div>
        ) : null}
        {children}
      </Banner>
    );
  }

  return (
    <Banner
      tone="warn"
      title={title ?? "Export required before deletion"}
      message={
        description ??
        "All destructive deletion actions are locked until a full workspace export has completed in this session."
      }
      className={className}
    >
      {onExport ? (
        <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
          <Button
            type="button"
            variant="nb_btn_secondary"
            size="nb_btn_sm"
            onClick={onExport}
            disabled={isExporting}
            leadingIcon={DownloadIcon}
          >
            {isExporting ? "Exporting..." : exportButtonLabel}
          </Button>
        </div>
      ) : null}
      {onAcknowledgeChange ? (
        <Checkbox
          checked={acknowledged}
          onChange={(event) => { onAcknowledgeChange(event.target.checked); }}
          className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]"
        >
          I have already backed up this data or do not require an export
        </Checkbox>
      ) : null}
      {children}
    </Banner>
  );
}
