import * as React from "react";
import {
  DASHBOARD_SORT_KEYS_CONFIG,
  type DashboardSortKey,
} from "@notebook/contracts";
import { cn } from "../../lib/utils.js";

export interface SortSelectProps
  extends Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "value" | "onChange"
  > {
  value: DashboardSortKey;
  onChange: ((key: DashboardSortKey) => void) | undefined;
}

/**
 * Dashboard sort control. Options render from the single
 * `DASHBOARD_SORT_KEYS_CONFIG` (parent ticket 05, §5 reuse rule) — adding a
 * sort key means adding one config entry, never touching this file.
 */
const SortSelect = React.forwardRef<HTMLSelectElement, SortSelectProps>(
  ({ className, value, onChange, ...props }, ref) => (
    <select
      ref={ref}
      value={value}
      onChange={(event) => {
        onChange?.(event.target.value as DashboardSortKey);
      }}
      className={cn(
        "min-h-[var(--nb-size-control-md)] rounded-[var(--nb-radius-input)] border border-[var(--nb-edge)] bg-[var(--nb-well)] px-[var(--nb-space-3)] text-sm text-[var(--nb-ink)] focus-visible:outline-solid focus-visible:outline-[length:var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
        className
      )}
      {...props}
    >
      {DASHBOARD_SORT_KEYS_CONFIG.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
);
SortSelect.displayName = "SortSelect";

export { SortSelect };
