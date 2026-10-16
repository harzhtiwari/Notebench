import * as React from "react";
import {
  Circle,
  Sparkle,
  CheckCircle,
  WarningCircle,
  XCircle,
} from "./icons.js";
import { cn } from "../../lib/utils.js";

export type GenerationStatus =
  | "pending"
  | "active"
  | "done"
  | "error"
  | "cancelled";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: GenerationStatus;
  label?: string | undefined;
  icon?: React.ReactNode | undefined;
}

interface StatusMeta {
  label: string;
  className: string;
  Icon: typeof Circle;
  weight?: "fill" | "regular";
}

const STATUS_CONFIG: Record<GenerationStatus, StatusMeta> = {
  pending: {
    label: "Pending",
    className: "bg-[var(--nb-well)] text-[var(--nb-ink-2)]",
    Icon: Circle,
    weight: "regular",
  },
  active: {
    label: "Generating",
    className: "bg-[var(--nb-ai-wash)] text-[var(--nb-ai)]",
    Icon: Sparkle,
    weight: "fill",
  },
  done: {
    label: "Done",
    className: "bg-[var(--nb-ok-wash)] text-[var(--nb-ok)]",
    Icon: CheckCircle,
    weight: "fill",
  },
  error: {
    label: "Error",
    className: "bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]",
    Icon: WarningCircle,
    weight: "fill",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-[var(--nb-well)] text-[var(--nb-ink-3)]",
    Icon: XCircle,
    weight: "fill",
  },
};

/**
 * Reusable generation/job status badge (Ticket 13).
 * Composes board `.badge` pattern. Status is NEVER color-alone — icon + label text always.
 */
const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, status, label, icon, children, ...props }, ref) => {
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    const DefaultIcon = config.Icon;
    const displayText = children ?? label ?? config.label;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold leading-[var(--nb-leading-ui)] whitespace-nowrap select-none",
          config.className,
          className
        )}
        {...props}
      >
        {icon !== undefined ? (
          icon
        ) : (
          <DefaultIcon
            size={14}
            weight={config.weight ?? "regular"}
            aria-hidden="true"
            className="shrink-0"
          />
        )}
        {displayText}
      </span>
    );
  }
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
