import * as React from "react";
import { WarningIcon } from "./icons.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./overlays.js";
import { cn } from "../../lib/utils.js";

export type CitationChipState = "normal" | "current" | "missing";

export interface CitationChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
  Text or node shown on the chip (e.g. "p. 12", "14:32")
  */
  label?: React.ReactNode | undefined;
  /**
  Optional page number convenience helper
  */
  pageNumber?: number | string | undefined;
  /**
  FSM state: normal, current (open in viewer/shelf), or missing (source removed)
  */
  state?: CitationChipState | undefined;
  /**
  Convenience flag for "source removed" / missing state
  */
  missing?: boolean | undefined;
  /**
  Convenience flag for active/current state
  */
  current?: boolean | undefined;
  /**
  Custom icon override
  */
  icon?: React.ReactNode | undefined;
}

/**
CitationChip: board `.cite` / `.cite--missing` pattern.
Supports FSM states: normal, hover/active, current (`aria-current="true"`),
and "source removed" / missing (`.cite--missing`).
*/
export const CitationChip = React.forwardRef<HTMLButtonElement, CitationChipProps>(
  (
    {
      className,
      label,
      pageNumber,
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
      children ??
      label ??
      (pageNumber === undefined ? undefined : `p. ${pageNumber}`) ??
      (isMissing ? "Source removed" : undefined);

    return (
      <button
        ref={ref}
        type={type}
        aria-current={isCurrent ? "true" : undefined}
        data-state={isMissing ? "missing" : (isCurrent ? "current" : "normal")}
        className={cn(
          "cite inline-flex min-h-[var(--nb-size-target-min)] cursor-pointer items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] border px-[var(--nb-space-2)] mx-[var(--nb-space-0-5)] align-baseline text-xs font-semibold tabular-nums leading-[var(--nb-leading-none)] font-[family-name:var(--nb-font-ui)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:underline hover:shadow-[0_0_0_var(--nb-border-1)_var(--nb-marker-text)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
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
        {isMissing && (icon ?? <WarningIcon size={16} weight="bold" aria-hidden="true" className="shrink-0" />)}
        {content}
      </button>
    );
  }
);
CitationChip.displayName = "CitationChip";

export interface CitationTooltipProps {
  /**
  Cite label exactly as in text (e.g. "p. 12").
  */
  label: string;
  /**
  Source title shown in the preview.
  */
  title: string;
  /**
  Cited excerpt shown in the preview.
  */
  excerpt: string;
  className?: string | undefined;
}

/**
Citation chip with preview: board `.cite` shape (marker fill, marker-text
border) wrapping the ui `Tooltip` — title + excerpt preview, opening the
viewer lands with the parent ticket's "Open in Source Viewer" row.
Presentational only.
*/
export const CitationTooltip = React.forwardRef<
  HTMLButtonElement,
  CitationTooltipProps
>(({ label, title, excerpt, className }, ref) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <CitationChip
          ref={ref}
          label={label}
          aria-label={`Source: ${title}, ${label}`}
          className={className}
        />
      </TooltipTrigger>
      <TooltipContent className="grid max-w-[var(--nb-layout-popover-w)] gap-[var(--nb-space-1)]">
        <span className="font-semibold text-xs text-[var(--nb-ink)]">{title}</span>
        <span className="font-regular text-xs text-[var(--nb-ink-2)]">{excerpt}</span>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
));
CitationTooltip.displayName = "CitationTooltip";

export type CitationHighlightProps = React.HTMLAttributes<HTMLSpanElement>;

/**
Inline marker-swipe highlight for cited words in rendered prose
(board `.hl`).
*/
export const CitationHighlight: React.FC<CitationHighlightProps> = ({
  className,
  ...props
}) => (
  <span
    className={cn(
      "hl bg-[var(--nb-marker-swipe)] text-[var(--nb-ink)] [box-shadow:inset_0_calc(var(--nb-border-2)*-1)_0_var(--nb-marker-text)] px-[var(--nb-space-0-5)]",
      className
    )}
    {...props}
  />
);

export type CitationPassageProps = React.HTMLAttributes<HTMLParagraphElement>;

/**
Quoted passage well shown before opening the source viewer
(board `.passage`).
*/
export const CitationPassage: React.FC<CitationPassageProps> = ({
  className,
  ...props
}) => (
  <p
    className={cn(
      "passage rounded-[var(--nb-radius-well)] bg-[var(--nb-marker-wash)] p-[var(--nb-space-3)] sm:px-[var(--nb-space-4)] font-[family-name:var(--nb-font-read)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]",
      className
    )}
    {...props}
  />
);
