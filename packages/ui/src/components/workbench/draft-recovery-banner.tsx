import * as React from "react";
import { Button } from "../primitives/button.js";
import { ClockCounterClockwise } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface DraftRecoveryBannerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  draftTimestamp?: string | Date | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onRecover: () => void;
  onDiscard: () => void;
  recoverLabel?: string | undefined;
  discardLabel?: string | undefined;
}

/**
 * Draft recovery offer banner (issue 15, Decision 4.4).
 * Appears when an uncommitted local draft is detected on reload.
 */
export const DraftRecoveryBanner = React.forwardRef<
  HTMLDivElement,
  DraftRecoveryBannerProps
>(
  (
    {
      className,
      draftTimestamp,
      title = "Unsaved draft found",
      message,
      onRecover,
      onDiscard,
      recoverLabel = "Restore draft",
      discardLabel = "Discard",
      ...props
    },
    ref
  ) => {
    const formattedTime =
      draftTimestamp instanceof Date
        ? draftTimestamp.toLocaleTimeString()
        : draftTimestamp;

    const defaultMessage = formattedTime
      ? `A newer uncommitted draft from ${formattedTime} was found. Would you like to restore it?`
      : "A newer uncommitted draft was found. Would you like to restore it?";

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "banner banner--warn grid grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border border-[var(--nb-warn)] bg-[var(--nb-warn-wash)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <ClockCounterClockwise
          size={20}
          weight="fill"
          aria-hidden="true"
          className="text-[var(--nb-warn)]"
        />
        <div className="grid gap-[var(--nb-space-2)]">
          <p className="text-sm font-semibold text-[var(--nb-warn)]">{title}</p>
          <p className="text-sm">{message ?? defaultMessage}</p>
          <div className="flex flex-wrap items-center gap-[var(--nb-space-2)] pt-[var(--nb-space-1)]">
            <Button variant="default" size="sm" onClick={onRecover}>
              {recoverLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={onDiscard}>
              {discardLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

DraftRecoveryBanner.displayName = "DraftRecoveryBanner";
