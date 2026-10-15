import * as React from "react";
import { Warning } from "./icons.js";
import { cn } from "../lib/utils.js";

export type CitationChipState = "normal" | "current" | "missing";

export interface CitationChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Text or node shown on the chip (e.g. "p. 12", "14:32") */
  label?: React.ReactNode | undefined;
  /** FSM state: normal, current (open in viewer/shelf), or missing (source removed) */
  state?: CitationChipState | undefined;
  /** Convenience flag for "source removed" / missing state */
  missing?: boolean | undefined;
  /** Convenience flag for active/current state */
  current?: boolean | undefined;
  /** Custom icon override */
  icon?: React.ReactNode | undefined;
}

/**
 * CitationChip (ticket 11): board `.cite` / `.cite--missing` pattern.
 * Supports FSM states: normal, hover/active, current (`aria-current="true"`),
 * and "source removed" / missing (`.cite--missing`).
 */
const CitationChip = React.forwardRef<HTMLButtonElement, CitationChipProps>(
  (
    {
      className,
      label,
      state,
      missing,
      current,
      icon,
      type = "button",
      children,
      ...props
    },
    ref
  ) => {
    const isCurrent =
      Boolean(current) ||
      state === "current" ||
      props["aria-current"] === true ||
      props["aria-current"] === "true";

    const isMissing = Boolean(missing) || state === "missing";

    const content =
      children ?? label ?? (isMissing ? "Source removed" : undefined);

    return (
      <button
        ref={ref}
        type={type}
        aria-current={isCurrent ? "true" : undefined}
        data-state={isMissing ? "missing" : isCurrent ? "current" : "normal"}
        className={cn(
          "cite inline-flex min-h-[var(--nb-size-target-min)] cursor-pointer items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] border px-[var(--nb-space-2)] mx-[var(--nb-space-0-5)] align-baseline text-xs font-semibold tabular-nums leading-[var(--nb-leading-none)] font-[family-name:var(--nb-font-ui)] transition-colors hover:underline focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
          !isMissing &&
            !isCurrent &&
            "border-[var(--nb-marker-text)] bg-[var(--nb-marker)] text-[var(--nb-on-marker)]",
          isCurrent &&
            "border-[var(--nb-ink)] bg-[var(--nb-ink)] text-[var(--nb-ink-inv)]",
          isMissing &&
            "cite--missing border-[var(--nb-warn)] bg-[var(--nb-warn-wash)] text-[var(--nb-warn)]",
          className
        )}
        {...props}
      >
        {isMissing && (icon ?? <Warning size={16} aria-hidden="true" className="shrink-0" />)}
        {content}
      </button>
    );
  }
);
CitationChip.displayName = "CitationChip";

export { CitationChip };
