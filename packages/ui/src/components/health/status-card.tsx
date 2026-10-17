import * as React from "react";
import type { HealthProbeResult, HealthProbeStatus } from "@notebench/contracts";
import { Button } from "../primitives/button.js";
import { Badge, type BadgeVariant } from "../primitives/badges.js";
import {
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  XCircle,
} from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

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
  { label: string; variant: BadgeVariant; Icon: typeof CheckCircle }
> = {
  pass: {
    label: "Pass",
    variant: "ok",
    Icon: CheckCircle,
  },
  warn: {
    label: "Warning",
    variant: "warn",
    Icon: WarningCircle,
  },
  fail: {
    label: "Fail",
    variant: "danger",
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
          <h3 className="text-[length:var(--nb-text-sm)] font-[number:var(--nb-weight-semibold)] leading-[var(--nb-leading-none)]">
            {probe.name}
          </h3>
          <Badge
            variant={meta.variant}
            icon={<Icon size={14} weight="fill" aria-hidden="true" />}
          >
            {meta.label}
          </Badge>
        </div>
        <p className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">{probe.message}</p>
        {thresholdLabel !== undefined ? (
          <p className="font-[family-name:var(--nb-font-mono)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-3)]">
            {thresholdLabel}
          </p>
        ) : null}
        {onRetry !== undefined ? (
          <div className="flex">
            <Button
              type="button"
              variant="nb_btn_ghost"
              size="nb_btn_sm"
              onClick={onRetry}
              leadingIcon={ArrowClockwise}
            >
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
