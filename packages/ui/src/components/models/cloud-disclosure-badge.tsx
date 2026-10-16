import * as React from "react";
import { Warning } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface CloudDisclosureBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Provider name interpolated into the disclosure copy. */
  providerName?: string | undefined;
  /** Alias for providerName to prevent DOM leak. */
  provider?: string | undefined;
}

/**
 * Transmitted-data warning for cloud providers (parent ticket 04, D8).
 * Board `.badge--warn` shape: icon + label always, never color-alone. Local
 * providers render no badge — the parent decides that by omitting this.
 */
const CloudDisclosureBadge = React.forwardRef<
  HTMLSpanElement,
  CloudDisclosureBadgeProps
>(({ className, providerName, provider, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center gap-[var(--nb-space-1)] whitespace-normal rounded-[var(--nb-radius-chip)] bg-[var(--nb-warn-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold leading-[var(--nb-leading-ui)] text-[var(--nb-warn)]",
      className
    )}
    {...props}
  >
    <Warning size={14} aria-hidden="true" className="shrink-0" />
    Your prompts and retrieved passages are transmitted to{" "}
    {providerName ?? provider ?? "this provider"}.
  </span>
));
CloudDisclosureBadge.displayName = "CloudDisclosureBadge";

export { CloudDisclosureBadge };
