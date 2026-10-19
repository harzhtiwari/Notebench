import * as React from "react";
import { IconButton } from "../primitives/button.js";
import { ClockCounterClockwiseIcon, ArrowUUpLeftIcon } from "../primitives/icons.js";
import { formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";

export interface HistoryRowProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /**
  The question / prompt text
  */
  question: string;
  /**
  Timestamp as ISO string, Date, or epoch milliseconds
  */
  timestamp?: string | Date | number | undefined;
  /**
  Optional pre-formatted time override (e.g. "5m ago")
  */
  time?: React.ReactNode | undefined;
  /**
  Callback when the question or row is selected
  */
  onSelect?: ((question: string) => void) | undefined;
  /**
  Callback specifically for the action affordance button
  */
  onAction?: ((question: string) => void) | undefined;
  /**
  Accessible label for the action button
  */
  actionLabel?: string | undefined;
  /**
  Custom action affordance override
  */
  action?: React.ReactNode | undefined;
}

/**
HistoryRow (ticket 11): chat history row with question text, timestamp /
relative time, and action affordance.

The row and the action are sibling controls (never nested), so keyboard
activation of the action can never also select the row.
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
      } else if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
        displayTime = formatRelativeTime(new Date(timestamp).toISOString());
      }
    }

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
        onClick={onClick}
        className={cn(
          "group flex min-h-[var(--nb-size-control-md)] items-center justify-between gap-[var(--nb-space-3)] rounded-[var(--nb-radius-control)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:bg-[var(--nb-well)]",
          className
        )}
        {...props}
      >
        <button
          type="button"
          onClick={() => {
            onSelect?.(question);
          }}
          className="flex min-w-0 flex-1 items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] text-left focus-visible:outline-[length:var(--nb-ring-width)] focus-visible:outline-solid focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]"
        >
          <ClockCounterClockwiseIcon
            size={16}
            aria-hidden="true"
            className="shrink-0 text-[var(--nb-ink-3)]"
          />
          <span className="truncate font-[number:var(--nb-weight-medium)]">{question}</span>
        </button>

        <div className="flex shrink-0 items-center gap-[var(--nb-space-2)]">
          {displayTime ? (
            <span className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-3)]">{displayTime}</span>
          ) : null}

          {action === undefined ? (onAction || onSelect ? (
            <IconButton
              type="button"
              size="nb_btn_icon_sm"
              aria-label={actionLabel}
              onClick={handleActionClick}
              icon={ArrowUUpLeftIcon}
            />
          ) : null) : (
            action
          )}
        </div>
      </div>
    );
  }
);
HistoryRow.displayName = "HistoryRow";

export { HistoryRow };
