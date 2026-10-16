import * as React from "react";
import { BookOpen, CaretRight } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface OpenInViewerRowProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onOpen: (() => void) | undefined;
}

/**
 * "Open in Source Viewer" row (ticket 09): the citation-popover action that
 * opens the `ViewerModal` at the cited page. Icon + label always, never
 * icon-alone. The cited locator travels via the parent's `onOpen`.
 */
const OpenInViewerRow = React.forwardRef<
  HTMLButtonElement,
  OpenInViewerRowProps
>(({ className, onOpen, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label="Open in Source Viewer"
    onClick={() => {
      onOpen?.();
    }}
    className={cn(
      "inline-flex min-h-[var(--nb-size-control-sm)] w-full cursor-pointer items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] px-[var(--nb-space-3)] text-xs font-semibold text-[var(--nb-ink)] hover:bg-[var(--nb-well-hover)]",
      className
    )}
    {...props}
  >
    <BookOpen size={16} aria-hidden="true" className="shrink-0" />
    <span className="grow text-left">Open in Source Viewer</span>
    <CaretRight size={16} aria-hidden="true" className="shrink-0" />
  </button>
));
OpenInViewerRow.displayName = "OpenInViewerRow";

export { OpenInViewerRow };
