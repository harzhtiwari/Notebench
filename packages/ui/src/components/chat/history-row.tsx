import * as React from "react";
import { ClockCounterClockwise, ArrowUUpLeft } from "../primitives/icons.js";
import { formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";

export interface HistoryRowProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** The question / prompt text */
  question: string;
  /** Timestamp as ISO string, Date, or epoch milliseconds */
  timestamp?: string | Date | number | undefined;
  /** Optional pre-formatted time override (e.g. "5m ago") */
  time?: React.ReactNode | undefined;
  /** Callback when the question or row is selected */
  onSelect?: ((question: string) => void) | undefined;
  /** Callback specifically for the action affordance button */
  onAction?: ((question: string) => void) | undefined;
  /** Accessible label for the action button */
  actionLabel?: string | undefined;
  /** Custom action affordance override */
  action?: React.ReactNode | undefined;
}

/**
 * HistoryRow (ticket 11): chat history row with question text, timestamp /
 * relative time, and action affordance.
 */
const HistoryRow = React.forwardRef<HTMLDivElement, HistoryRowProps>(
  (
    {
      className,
      question,
      timestamp,
      time,
      onSelect,
      onAction,
      actionLabel = "Reuse question",
      action,
      onClick,
      ...props
    },
    ref
  ) => {
    let displayTime = time;
    if (!displayTime && timestamp !== undefined) {
      if (typeof timestamp === "string") {
        displayTime = formatRelativeTime(timestamp);
      } else if (timestamp instanceof Date) {
        displayTime = formatRelativeTime(timestamp.toISOString());
      } else if (typeof timestamp === "number") {
        displayTime = formatRelativeTime(new Date(timestamp).toISOString());
      }
    }

    const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      onSelect?.(question);
    };

    const handleActionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (onAction) {
        onAction(question);
      } else {
        onSelect?.(question);
      }
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(question);
          }
        }}
        className={cn(
          "group flex min-h-[var(--nb-size-control-md)] cursor-pointer items-center justify-between gap-[var(--nb-space-3)] rounded-[var(--nb-radius-control)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-sm text-[var(--nb-ink)] transition-colors hover:bg-[var(--nb-well)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
          className
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-[var(--nb-space-2)]">
          <ClockCounterClockwise
            size={16}
            aria-hidden="true"
            className="shrink-0 text-[var(--nb-ink-3)]"
          />
          <span className="truncate font-medium">{question}</span>
        </div>

        <div className="flex shrink-0 items-center gap-[var(--nb-space-2)]">
          {displayTime ? (
            <span className="text-xs text-[var(--nb-ink-3)]">{displayTime}</span>
          ) : null}

          {action !== undefined ? (
            action
          ) : onAction || onSelect ? (
            <button
              type="button"
              aria-label={actionLabel}
              onClick={handleActionClick}
              className="grid h-[var(--nb-size-target-min)] w-[var(--nb-size-target-min)] cursor-pointer place-items-center rounded-[var(--nb-radius-control)] text-[var(--nb-ink-2)] transition-colors hover:bg-[var(--nb-well-hover)] hover:text-[var(--nb-ink)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)]"
            >
              <ArrowUUpLeft size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }
);
HistoryRow.displayName = "HistoryRow";

export { HistoryRow };
