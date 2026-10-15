import * as React from "react";
import type { HealthProbeResult, HealthProbeStatus } from "@notebook/contracts";
import { Button } from "./button.js";
import {
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  XCircle,
} from "./icons.js";
import { cn } from "../lib/utils.js";

export interface StatusCardProps extends React.HTMLAttributes<HTMLElement> {
  probe: HealthProbeResult;
  /** Descriptor threshold text (e.g. ">= 22.0.0"). Rendered when provided. */
  thresholdLabel?: string | undefined;
  /** Optional retry action (e.g. re-ping the worker). Rendered when provided. */
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
}

const STATUS_META: Record<
  HealthProbeStatus,
  { label: string; className: string; Icon: typeof CheckCircle }
> = {
  pass: {
    label: "Pass",
    className: "bg-[var(--nb-ok-wash)] text-[var(--nb-ok)]",
    Icon: CheckCircle,
  },
  warn: {
    label: "Warning",
    className: "bg-[var(--nb-warn-wash)] text-[var(--nb-warn)]",
    Icon: WarningCircle,
  },
  fail: {
    label: "Fail",
    className: "bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]",
    Icon: XCircle,
  },
};

/**
 * Health probe status card (issue 23). Presentational only: probe result in,
 * board `.badge` status out. Status is never color-alone — icon + label always.
 */
const StatusCard = React.forwardRef<HTMLElement, StatusCardProps>(
  ({ className, probe, thresholdLabel, onRetry, retryLabel = "Retry", ...props }, ref) => {
    const meta = STATUS_META[probe.status];
    const { Icon } = meta;
    return (
      <section
        ref={ref}
        aria-label={`${probe.name}: ${meta.label}`}
        className={cn(
          "grid gap-[var(--nb-space-2)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)]">
          <h3 className="text-sm font-semibold leading-none">{probe.name}</h3>
          <span
            className={cn(
              "inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold",
              meta.className
            )}
          >
            <Icon size={14} weight="fill" aria-hidden="true" />
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-[var(--nb-ink-2)]">{probe.message}</p>
        {thresholdLabel !== undefined ? (
          <p className="font-[var(--nb-font-mono)] text-xs text-[var(--nb-ink-3)]">{thresholdLabel}</p>
        ) : null}
        {onRetry !== undefined ? (
          <div className="flex">
            <Button variant="ghost" size="sm" onClick={onRetry}>
              <ArrowClockwise size={14} aria-hidden="true" />
              {retryLabel}
            </Button>
          </div>
        ) : null}
      </section>
    );
  }
);
StatusCard.displayName = "StatusCard";

export { StatusCard };
