import * as React from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./popover.js";
import { Quotes } from "./icons.js";
import { Button } from "./button.js";
import { cn } from "../lib/utils.js";

export interface CitationPopoverProps {
  /** The trigger element (e.g. CitationChip). If omitted, children is used as trigger. */
  trigger?: React.ReactNode | undefined;
  /** Children element; if trigger is omitted, children acts as trigger */
  children?: React.ReactNode | undefined;
  /** Source title */
  title: string;
  /** Page or location subtitle (e.g. "Page 12, paragraph 2") */
  location?: React.ReactNode | undefined;
  /** Cited passage content */
  passage?: React.ReactNode | undefined;
  /** Excerpt alias for passage */
  excerpt?: React.ReactNode | undefined;
  /** Callback when user clicks "Open in source" */
  onOpenSource?: (() => void) | undefined;
  /** Label for the action button; defaults to "Open in source" */
  openSourceLabel?: string | undefined;
  /** Controlled open state */
  open?: boolean | undefined;
  /** Controlled onOpenChange callback */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Alignment relative to trigger */
  align?: "start" | "center" | "end" | undefined;
  /** Side relative to trigger */
  side?: "top" | "right" | "bottom" | "left" | undefined;
  className?: string | undefined;
}

/**
 * CitationPopover (ticket 11): popover showing title + excerpt leading to passage
 * (board `.passage` class). Uses Radix `Popover` from `./popover.js`.
 */
export function CitationPopover({
  trigger,
  children,
  title,
  location,
  passage,
  excerpt,
  onOpenSource,
  openSourceLabel = "Open in source",
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  className,
}: CitationPopoverProps) {
  const triggerElement = trigger ?? children;
  const passageContent = passage ?? excerpt;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {triggerElement ? (
        <PopoverTrigger asChild>{triggerElement}</PopoverTrigger>
      ) : null}
      <PopoverContent
        align={align}
        side={side}
        className={cn(
          "pop grid w-[var(--nb-layout-popover-w)] max-w-[calc(100vw-var(--nb-space-4))] gap-[var(--nb-space-2)] rounded-[var(--nb-radius-menu)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-float)]",
          className
        )}
      >
        <div role="group" aria-label="Citation preview" className="grid gap-[var(--nb-space-2)]">
          <div className="flex items-start justify-between gap-[var(--nb-space-2)]">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-[var(--nb-ink)]">
                {title}
              </h4>
              {location ? (
                <p className="help text-xs text-[var(--nb-ink-3)]">{location}</p>
              ) : null}
            </div>
            <Quotes size={16} aria-hidden="true" className="shrink-0 text-[var(--nb-ink-3)]" />
          </div>

          {passageContent ? (
            <p className="passage rounded-[var(--nb-radius-well)] bg-[var(--nb-marker-wash)] p-[var(--nb-space-3)] text-sm font-[family-name:var(--nb-font-read)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]">
              {passageContent}
            </p>
          ) : null}

          {trigger && children ? children : null}

          {onOpenSource ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={onOpenSource}
                className="cursor-pointer"
              >
                {openSourceLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
