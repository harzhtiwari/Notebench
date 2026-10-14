import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "./dialog.js";
import { Button } from "./button.js";
import { CaretRight, X } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface ViewerModalProps {
  open: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Source title shown in the dialog header. */
  title: string;
  /** 1-based current page. */
  page: number;
  /** Total pages. */
  pageCount: number;
  onPageChange?: ((page: number) => void) | undefined;
  /** Cited passage rendered with the board `.hl` highlight. */
  citedPassage?: string | undefined;
  /** Page content slot (the parent renders pages; the modal owns chrome). */
  children?: React.ReactNode;
}

/**
 * Source viewer modal (ticket 09): 1020 px Radix dialog with page navigation
 * and cited-passage highlight. Board defines no 1020 px token (max
 * `modal-lg` 896 px), so the width is a recorded deviation. Presentational
 * only — page rendering, locators and downloads land with the parent ticket.
 */
const ViewerModal = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ViewerModalProps
>(
  (
    {
      open,
      onOpenChange,
      title,
      page,
      pageCount,
      onPageChange,
      citedPassage,
      children,
    },
    ref
  ) => {
    const atFirst = page <= 1;
    const atLast = page >= pageCount;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            ref={ref}
            aria-describedby={undefined}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100%-var(--nb-space-8))] w-[min(1020px,calc(100%-var(--nb-space-8)))] translate-x-[-50%] translate-y-[-50%] gap-[var(--nb-space-3)] overflow-y-auto rounded-[var(--nb-radius-modal)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-modal)]"
            )}
          >
            <div className="flex items-center justify-between gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pb-[var(--nb-space-2)] pt-[var(--nb-space-5)]">
              <DialogTitle>{title}</DialogTitle>
              <div className="flex items-center gap-[var(--nb-space-1)]">
                <span
                  role="status"
                  className="mr-[var(--nb-space-1)] text-xs tabular-nums text-[var(--nb-ink-2)]"
                >
                  Page {page} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Previous page"
                  disabled={atFirst}
                  onClick={() => {
                    onPageChange?.(page - 1);
                  }}
                >
                  <CaretRight
                    size={16}
                    aria-hidden="true"
                    className="rotate-180"
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Next page"
                  disabled={atLast}
                  onClick={() => {
                    onPageChange?.(page + 1);
                  }}
                >
                  <CaretRight size={16} aria-hidden="true" />
                </Button>
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="inline-flex min-h-[var(--nb-size-control-sm)] min-w-[var(--nb-size-control-sm)] items-center justify-center rounded-[var(--nb-radius-control)] text-[var(--nb-ink-2)] hover:bg-[var(--nb-well-hover)]"
                >
                  <X size={16} aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="grid gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pb-[var(--nb-space-5)]">
              {children}
              {citedPassage !== undefined ? (
                <p className="rounded-[var(--nb-radius-well)] bg-[var(--nb-marker-wash)] px-[var(--nb-space-4)] py-[var(--nb-space-3)] font-[var(--nb-font-read)] leading-[var(--nb-leading-read)]">
                  <mark className="bg-[var(--nb-marker-swipe)] px-[var(--nb-space-0-5)] text-[var(--nb-ink)] shadow-[inset_0_calc(var(--nb-border-2)*-1)_0_var(--nb-marker-text)]">
                    {citedPassage}
                  </mark>
                </p>
              ) : null}
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    );
  }
);
ViewerModal.displayName = "ViewerModal";

export { ViewerModal };
