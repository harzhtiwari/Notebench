import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip.js";
import { cn } from "../lib/utils.js";

export interface CitationTooltipProps {
  /** Cite label exactly as in text (e.g. "p. 12"). */
  label: string;
  /** Source title shown in the preview. */
  title: string;
  /** Cited excerpt shown in the preview. */
  excerpt: string;
  className?: string | undefined;
}

/**
 * Citation chip with preview (ticket 09): board `.cite` shape (marker fill,
 * marker-text border) wrapping the ui `Tooltip` — title + excerpt preview,
 * opening the viewer lands with the parent ticket's "Open in Source Viewer"
 * row. Presentational only.
 */
const CitationTooltip = React.forwardRef<
  HTMLButtonElement,
  CitationTooltipProps
>(({ label, title, excerpt, className }, ref) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={`Source: ${title}, ${label}`}
          className={cn(
            "inline-flex min-h-[var(--nb-size-target-min)] cursor-pointer items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] border border-[var(--nb-marker-text)] bg-[var(--nb-marker)] px-[var(--nb-space-2)] align-baseline text-xs font-semibold tabular-nums text-[var(--nb-on-marker)]",
            className
          )}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="grid max-w-[var(--nb-layout-popover-w)] gap-[var(--nb-space-1)]">
        <span className="font-semibold">{title}</span>
        <span className="font-normal opacity-90">{excerpt}</span>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
));
CitationTooltip.displayName = "CitationTooltip";

export { CitationTooltip };
