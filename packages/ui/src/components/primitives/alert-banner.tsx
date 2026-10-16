import * as React from "react";
import { Button } from "./button.js";
import { Warning } from "./icons.js";
import { cn } from "../../lib/utils.js";

export interface AlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
  title?: string | undefined;
  tone?: "warn" | "error" | "info" | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

const TONE_CLASS: Record<NonNullable<AlertBannerProps["tone"]>, string> = {
  warn: "border-[var(--nb-warn)] bg-[var(--nb-warn-wash)]",
  error: "border-[var(--nb-danger)] bg-[var(--nb-danger-wash)]",
  info: "border-[var(--nb-link)] bg-[var(--nb-link-wash)]",
};

const TONE_TEXT: Record<NonNullable<AlertBannerProps["tone"]>, string> = {
  warn: "text-[var(--nb-warn)]",
  error: "text-[var(--nb-danger)]",
  info: "text-[var(--nb-link)]",
};

/**
 * Exposure alert banner (issue 23). Board `.banner` shape: icon + lead title +
 * message + optional action. `role="alert"` so assistive tech announces it.
 */
const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  (
    { className, message, title = "Exposure alert", tone = "warn", actionLabel, onAction, ...props },
    ref
  ) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border p-[var(--nb-space-4)]",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      <Warning size={20} weight="fill" aria-hidden="true" className={TONE_TEXT[tone]} />
      <div className="grid gap-[var(--nb-space-2)] text-[var(--nb-ink)]">
        <p className={cn("text-sm font-semibold", TONE_TEXT[tone])}>{title}</p>
        <p className="text-sm">{message}</p>
        {actionLabel !== undefined && onAction !== undefined ? (
          <div className="flex flex-wrap gap-[var(--nb-space-2)]">
            <Button variant="outline" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
);
AlertBanner.displayName = "AlertBanner";

export { AlertBanner };
