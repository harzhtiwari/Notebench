import * as React from "react";
import type { AutosaveStatus } from "../lib/autosave-policy.js";
import {
  CheckCircle,
  ClockCounterClockwise,
  ArrowClockwise,
  XCircle,
} from "./icons.js";
import { Button } from "./button.js";
import { cn } from "../lib/utils.js";

export interface AutosaveDotProps extends React.HTMLAttributes<HTMLDivElement> {
  status: AutosaveStatus;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
}

const STATUS_CONFIG: Record<
  AutosaveStatus,
  {
    label: string;
    dotClass: string;
    textClass: string;
    Icon: typeof CheckCircle;
    spin?: boolean;
  }
> = {
  idle: {
    label: "Saved",
    dotClass: "bg-[var(--nb-hairline)]",
    textClass: "text-[var(--nb-ink-3)]",
    Icon: CheckCircle,
  },
  saved: {
    label: "Saved",
    dotClass: "bg-[var(--nb-ok)]",
    textClass: "text-[var(--nb-ok)]",
    Icon: CheckCircle,
  },
  drafting: {
    label: "Editing...",
    dotClass: "bg-[var(--nb-warn)]",
    textClass: "text-[var(--nb-warn)]",
    Icon: ClockCounterClockwise,
  },
  saving: {
    label: "Saving...",
    dotClass: "bg-[var(--nb-ai)]",
    textClass: "text-[var(--nb-ai)]",
    Icon: ArrowClockwise,
    spin: true,
  },
  error: {
    label: "Save failed",
    dotClass: "bg-[var(--nb-danger)]",
    textClass: "text-[var(--nb-danger)]",
    Icon: XCircle,
  },
};

/**
 * Autosave indicator (issue 15, Decision 1.40).
 * Displays transitions: Editing... -> Saving... -> Saved (and Save failed retry).
 * Never relies on color alone: icon + text accompanies every state.
 */
export const AutosaveDot = React.forwardRef<HTMLDivElement, AutosaveDotProps>(
  ({ className, status, onRetry, retryLabel = "Retry", ...props }, ref) => {
    const config = STATUS_CONFIG[status];
    const { Icon, spin } = config;

    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-[var(--nb-space-2)] text-xs font-medium",
          config.textClass,
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "h-[var(--nb-space-2)] w-[var(--nb-space-2)] rounded-[var(--nb-radius-full)] transition-colors duration-[var(--nb-dur-base)]",
            config.dotClass
          )}
          aria-hidden="true"
        />
        <Icon
          size={14}
          weight="fill"
          aria-hidden="true"
          className={spin ? "animate-spin" : undefined}
        />
        <span>{config.label}</span>
        {status === "error" && onRetry !== undefined ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-[var(--nb-size-control-sm)] px-[var(--nb-space-2)] text-xs text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }
);

AutosaveDot.displayName = "AutosaveDot";
