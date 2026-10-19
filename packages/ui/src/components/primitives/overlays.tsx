import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils.js";
import { Button, IconButton } from "./button.js";
import { QuotesIcon, XIcon } from "./icons.js";

/* -------------------------------------------------------------------------- *
 * Dialog — board anatomy: header (title + close), body, footer.
 * -------------------------------------------------------------------------- */

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--nb-z-modal)] bg-[var(--nb-scrim)] transition-opacity duration-[var(--nb-dur-slow)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export type DialogSize = "sm" | "md" | "lg" | "viewer" | "custom";

const dialogSizeClassNames: Record<DialogSize, string> = {
  sm: "w-[min(var(--nb-layout-modal-sm),calc(100%-var(--nb-space-8)))]",
  md: "w-[min(var(--nb-layout-modal-md),calc(100%-var(--nb-space-8)))]",
  lg: "w-[min(var(--nb-layout-modal-lg),calc(100%-var(--nb-space-8)))]",
  viewer: "w-[min(var(--nb-layout-modal-lg),calc(100%-var(--nb-space-8)))]",
  custom: "",
};

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
  Width preset from the board modal scale; `custom` leaves the width to the consumer.
  */
  size?: DialogSize | undefined;
  /**
  Renders the floating top-right close button for single-purpose dialogs.
  */
  showCloseButton?: boolean | undefined;
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, size = "sm", showCloseButton = false, ...props },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-modal="true"
        className={cn(
          "fixed left-[50%] top-[50%] z-[var(--nb-z-modal)] grid translate-x-[-50%] translate-y-[-50%] rounded-[var(--nb-radius-modal)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-modal)] duration-[var(--nb-dur-slow)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          dialogSizeClassNames[size],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogCloseButton className="absolute right-[var(--nb-space-3)] top-[var(--nb-space-3)]" />
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-between gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pt-[var(--nb-space-5)] pb-[var(--nb-space-2)]",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "grid gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pt-[var(--nb-space-2)] pb-[var(--nb-space-4)]",
      className
    )}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-[var(--nb-space-2)] px-[var(--nb-space-5)] pt-[var(--nb-space-3)] pb-[var(--nb-space-5)]",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-xl)] font-[number:var(--nb-weight-semibold)] leading-[var(--nb-leading-tight)] text-[var(--nb-ink)]",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "text-[length:var(--nb-text-xs)] leading-[var(--nb-leading-ui)] text-[var(--nb-ink-2)]",
      className
    )}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogCloseButton = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, children, "aria-label": ariaLabel = "Close", ...props }, ref) => (
  <DialogPrimitive.Close asChild>
    <IconButton
      ref={ref}
      variant="nb_btn_ghost"
      size="nb_btn_icon_sm"
      icon={XIcon}
      className={className}
      {...props}
      aria-label={ariaLabel}
    >
      {children}
    </IconButton>
  </DialogPrimitive.Close>
));
DialogCloseButton.displayName = "DialogCloseButton";

/* -------------------------------------------------------------------------- *
 * Popover — floating utility layer (z 40), below modals (z 50).
 * -------------------------------------------------------------------------- */

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-[var(--nb-z-popover)] max-w-[var(--nb-layout-popover-w)] rounded-[var(--nb-radius-menu)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-float)] outline-none duration-[var(--nb-dur-fast)] motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

/* -------------------------------------------------------------------------- *
 * Tooltip — single-line helper over the popover layer.
 * -------------------------------------------------------------------------- */

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[var(--nb-z-toast)] overflow-hidden rounded-[var(--nb-radius-tag)] bg-[var(--nb-ink)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-inv)] shadow-[var(--nb-shadow-float)] duration-[var(--nb-dur-fast)] motion-reduce:duration-0 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/* -------------------------------------------------------------------------- *
 * CitationPopover (ticket 11) — citation preview over the passage well.
 * -------------------------------------------------------------------------- */

export interface CitationPopoverProps {
  /**
  The trigger element (e.g. CitationChip). If omitted, children is used as trigger.
  */
  trigger?: React.ReactNode | undefined;
  /**
  Children element; if trigger is omitted, children acts as trigger
  */
  children?: React.ReactNode | undefined;
  /**
  Source title
  */
  title: string;
  /**
  Page or location subtitle (e.g. "Page 12, paragraph 2")
  */
  location?: React.ReactNode | undefined;
  /**
  Cited passage content
  */
  passage?: React.ReactNode | undefined;
  /**
  Excerpt alias for passage
  */
  excerpt?: React.ReactNode | undefined;
  /**
  Callback when user clicks "Open in source"
  */
  onOpenSource?: (() => void) | undefined;
  /**
  Label for the action button; defaults to "Open in source"
  */
  openSourceLabel?: string | undefined;
  /**
  Controlled open state
  */
  open?: boolean | undefined;
  /**
  Controlled onOpenChange callback
  */
  onOpenChange?: ((isOpen: boolean) => void) | undefined;
  /**
  Alignment relative to trigger
  */
  align?: "start" | "center" | "end" | undefined;
  /**
  Side relative to trigger
  */
  side?: "top" | "right" | "bottom" | "left" | undefined;
  className?: string | undefined;
}

/**
CitationPopover (ticket 11): popover showing title + excerpt leading to
passage (board `.passage` class).
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
        <div
          role="group"
          aria-label="Citation preview"
          className="grid gap-[var(--nb-space-2)]"
        >
          <div className="flex items-start justify-between gap-[var(--nb-space-2)]">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-[var(--nb-ink)]">
                {title}
              </h4>
              {location ? (
                <p className="help text-xs text-[var(--nb-ink-3)]">
                  {location}
                </p>
              ) : null}
            </div>
            <QuotesIcon
              size={16}
              aria-hidden="true"
              className="shrink-0 text-[var(--nb-ink-3)]"
            />
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
                variant="nb_btn_secondary"
                size="nb_btn_sm"
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

export {
  // Dialog
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  // Popover
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  // Tooltip
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
};
