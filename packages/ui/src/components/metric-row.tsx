import * as React from "react";
import { cn } from "../lib/utils.js";

export interface MetricRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Preformatted value text (numbers always beside labels, never bare). */
  value: string;
  /**
   * Fill fraction 0–1. Renders the bar when present; label/value-only
   * otherwise. Clamped, with the same 2% visibility floor as the popover.
   */
  fraction?: number | undefined;
}

/**
 * Generic metric row: label + value, optional bar. Generalizes the
 * `MetricsPopover` storage row without touching that component.
 */
const MetricRow = React.forwardRef<HTMLDivElement, MetricRowProps>(
  ({ className, label, value, fraction, ...props }, ref) => {
    if (fraction === undefined) {
      return (
        <div
          ref={ref}
          className={cn("flex justify-between text-xs", className)}
          {...props}
        >
          <span className="text-[var(--nb-ink-2)]">{label}</span>
          <span className="font-semibold text-[var(--nb-ink)]">{value}</span>
        </div>
      );
    }
    const percent = Math.max(
      2,
      Math.round(Math.min(1, Math.max(0, fraction)) * 100)
    );
    return (
      <div ref={ref} className={cn("grid gap-[var(--nb-space-1)]", className)} {...props}>
        <div className="flex justify-between text-xs">
          <span className="text-[var(--nb-ink-2)]">{label}</span>
          <span className="font-semibold text-[var(--nb-ink)]">{value}</span>
        </div>
        <div
          role="img"
          aria-label={`${label}: ${percent}%`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nb-well)]"
        >
          <div
            className="h-full bg-[var(--nb-ink-2)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
);
MetricRow.displayName = "MetricRow";

export { MetricRow };
