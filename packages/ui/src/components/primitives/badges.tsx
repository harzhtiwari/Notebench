import * as React from "react";
import type { TargetMilestone } from "@notebench/contracts";
import {
  CircleIcon,
  SparkleIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
  WarningIcon,
} from "./icons.js";
import { cn } from "../../lib/utils.js";

export type BadgeVariant =
  | "default"
  | "ok"
  | "warn"
  | "danger"
  | "ai"
  | "you"
  | "link";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant | undefined;
  icon?: React.ReactNode | undefined;
}

/**
Base `Badge`: board `.badge` shape with the seven-wash variant scale.
Flat surface (no shadows), chip radius, sentence-case labels only.
*/
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", icon, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold leading-[var(--nb-leading-ui)] font-[family-name:var(--nb-font-ui)] whitespace-nowrap select-none",
        variant === "default" && "bg-[var(--nb-well)] text-[var(--nb-ink-2)]",
        variant === "ok" && "badge--ok bg-[var(--nb-ok-wash)] text-[var(--nb-ok)]",
        variant === "warn" &&
          "badge--warn bg-[var(--nb-warn-wash)] text-[var(--nb-warn)]",
        variant === "danger" &&
          "badge--danger bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]",
        variant === "ai" && "badge--ai bg-[var(--nb-ai-wash)] text-[var(--nb-ai)]",
        variant === "you" &&
          "badge--you bg-[var(--nb-you-wash)] text-[var(--nb-you)]",
        variant === "link" &&
          "badge--link bg-[var(--nb-link-wash)] text-[var(--nb-link)]",
        className
      )}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </span>
  )
);
Badge.displayName = "Badge";

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
  variant: BadgeVariant;
  label: string;
  className?: string | undefined;
  Icon: typeof CircleIcon;
  weight: "fill" | "regular";
}

const STATUS_CONFIG: Record<GenerationStatus, StatusMeta> = {
  pending: {
    variant: "default",
    label: "Pending",
    Icon: CircleIcon,
    weight: "regular",
  },
  active: {
    variant: "ai",
    label: "Generating",
    Icon: SparkleIcon,
    weight: "fill",
  },
  done: {
    variant: "ok",
    label: "Done",
    Icon: CheckCircleIcon,
    weight: "fill",
  },
  error: {
    variant: "danger",
    label: "Error",
    Icon: WarningCircleIcon,
    weight: "fill",
  },
  cancelled: {
    variant: "default",
    label: "Cancelled",
    className: "text-[var(--nb-ink-3)]",
    Icon: XCircleIcon,
    weight: "fill",
  },
};

/**
Reusable generation/job status badge.
Composes the board `.badge` pattern. Status is NEVER color-alone — icon +
label text always.
*/
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, status, label, icon, children, ...props }, ref) => {
    const config = STATUS_CONFIG[status];
    const DefaultIcon = config.Icon;
    const displayText = children ?? label ?? config.label;

    return (
      <Badge
        ref={ref}
        variant={config.variant}
        icon={
          icon === undefined ? (
            <DefaultIcon
              size={16}
              weight={config.weight}
              aria-hidden="true"
              className="shrink-0"
            />
          ) : (
            icon
          )
        }
        className={cn(config.className, className)}
        {...props}
      >
        {displayText}
      </Badge>
    );
  }
);
StatusBadge.displayName = "StatusBadge";

export interface VersionBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  milestone: TargetMilestone;
}

/**
Roadmap arrival badge (`Coming in 0.2` / `Coming later`), hairline-bordered
well pill at 2xs type.
*/
export const VersionBadge: React.FC<VersionBadgeProps> = ({
  milestone,
  className,
  ...props
}) => {
  const label = milestone === "later" ? "Coming later" : `Coming in ${milestone}`;
  return (
    <span
      data-testid="version-badge"
      className={cn(
        "inline-flex items-center px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] rounded-[var(--nb-radius-chip)] text-[length:var(--nb-text-2xs)] font-medium bg-[var(--nb-well)] text-[var(--nb-ink-2)] border border-[var(--nb-hairline)] select-none",
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
};

export interface CloudDisclosureBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /**
  Provider name interpolated into the disclosure copy.
  */
  providerName?: string | undefined;
  /**
  Alias for providerName to prevent DOM leak.
  */
  provider?: string | undefined;
}

/**
Transmitted-data warning for cloud providers: board `.badge--warn` shape —
icon + label always, never color-alone. Local providers render no badge.
*/
export const CloudDisclosureBadge = React.forwardRef<
  HTMLSpanElement,
  CloudDisclosureBadgeProps
>(({ className, providerName, provider, ...props }, ref) => (
  <Badge
    ref={ref}
    variant="warn"
    icon={<WarningIcon size={16} aria-hidden="true" className="shrink-0" />}
    className={cn("whitespace-normal", className)}
    {...props}
  >
    Your prompts and retrieved passages are transmitted to{" "}
    {providerName ?? provider ?? "this provider"}.
  </Badge>
));
CloudDisclosureBadge.displayName = "CloudDisclosureBadge";
