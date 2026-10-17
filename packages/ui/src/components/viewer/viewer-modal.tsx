import * as React from "react";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../primitives/overlays.js";
import { IconButton } from "../primitives/button.js";
import { CitationHighlight, CitationPassage } from "../primitives/citations.js";
import { CaretRight, resolveIconProps } from "../primitives/icons.js";

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
  React.ElementRef<typeof DialogContent>,
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
        <DialogContent
          ref={ref}
          size="viewer"
          aria-describedby={undefined}
          className="max-h-[calc(100%-var(--nb-space-8))] gap-[var(--nb-space-3)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <div className="flex items-center gap-[var(--nb-space-1)]">
              <span
                role="status"
                className="mr-[var(--nb-space-1)] text-xs tabular-nums text-[var(--nb-ink-2)]"
              >
                Page {page} of {pageCount}
              </span>
              <IconButton
                type="button"
                variant="nb_btn_ghost"
                size="nb_btn_icon_sm"
                aria-label="Previous page"
                disabled={atFirst}
                onClick={() => {
                  onPageChange?.(page - 1);
                }}
              >
                <CaretRight
                  {...resolveIconProps({ size: "sm" })}
                  className="rotate-180"
                />
              </IconButton>
              <IconButton
                type="button"
                variant="nb_btn_ghost"
                size="nb_btn_icon_sm"
                aria-label="Next page"
                disabled={atLast}
                onClick={() => {
                  onPageChange?.(page + 1);
                }}
              >
                <CaretRight {...resolveIconProps({ size: "sm" })} />
              </IconButton>
              <DialogCloseButton />
            </div>
          </DialogHeader>
          <DialogBody className="pb-[var(--nb-space-5)]">
            {children}
            {citedPassage !== undefined ? (
              <CitationPassage>
                <CitationHighlight>{citedPassage}</CitationHighlight>
              </CitationPassage>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }
);
ViewerModal.displayName = "ViewerModal";

export { ViewerModal };
