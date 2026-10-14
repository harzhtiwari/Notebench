import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "./dialog.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";
import { Chip } from "./chip.js";
import { DropOverlay } from "./drop-overlay.js";
import { FormField } from "./form-field.js";
import { Input } from "./input.js";
import { FileText, Globe, Upload, X } from "./icons.js";
import { cn } from "../lib/utils.js";

export type IngestChannel = "upload" | "url" | "text";

export interface IngestModalProps {
  open: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Controlled channel. Omit (or use defaultChannel) for uncontrolled. */
  channel?: IngestChannel | undefined;
  defaultChannel?: IngestChannel | undefined;
  onChannelChange?: ((channel: IngestChannel) => void) | undefined;
  /** Shows the drop feedback over the upload channel while dragging. */
  dragActive?: boolean | undefined;
  /** Shows the amber soft-cap chip when the notebook holds 50+ Sources. */
  capReached?: boolean | undefined;
  /** Progress rows slot (per-Source queue states, SSE-driven by the parent). */
  children?: React.ReactNode;
}

/**
 * Source ingest modal (ticket 08): Upload / Web-Link / Paste-Text channels
 * behind ui Tabs in a Radix dialog (same centred pattern as the lockscreen
 * modal). Composes `Chip`, `DropOverlay`, `FormField`/`Input` — owns no
 * fetching, no queue, no policy; limits and statuses arrive via props and
 * children.
 */
const IngestModal = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  IngestModalProps
>(
  (
    {
      open,
      onOpenChange,
      channel,
      defaultChannel = "upload",
      onChannelChange,
      dragActive = false,
      capReached = false,
      children,
    },
    ref
  ) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          aria-describedby={undefined}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-[min(var(--nb-layout-modal-sm),calc(100%-var(--nb-space-8)))] translate-x-[-50%] translate-y-[-50%] gap-[var(--nb-space-3)] rounded-[var(--nb-radius-modal)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-modal)]"
          )}
        >
          <div className="flex items-center justify-between gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pb-[var(--nb-space-2)] pt-[var(--nb-space-5)]">
            <DialogTitle>Add sources</DialogTitle>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex min-h-[var(--nb-size-control-sm)] min-w-[var(--nb-size-control-sm)] items-center justify-center rounded-[var(--nb-radius-control)] text-[var(--nb-ink-2)] hover:bg-[var(--nb-well-hover)]"
            >
              <X size={16} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="grid gap-[var(--nb-space-3)] px-[var(--nb-space-5)] pb-[var(--nb-space-5)]">
            {capReached ? <Chip variant="warn">50+ sources</Chip> : null}
            <Tabs
              value={channel}
              defaultValue={defaultChannel}
              onValueChange={(value) => {
                onChannelChange?.(value as IngestChannel);
              }}
            >
              <TabsList aria-label="Ingest channels">
                <TabsTrigger value="upload">
                  <Upload size={14} aria-hidden="true" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="url">
                  <Globe size={14} aria-hidden="true" />
                  Web Link
                </TabsTrigger>
                <TabsTrigger value="text">
                  <FileText size={14} aria-hidden="true" />
                  Paste Text
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload">
                <div className="relative grid gap-[var(--nb-space-3)] pt-[var(--nb-space-2)]">
                  <DropOverlay active={dragActive} />
                  <p className="text-xs text-[var(--nb-ink-2)]">
                    Drag files anywhere over this dialog, or pick them below.
                    PDF, DOCX, TXT, MD.
                  </p>
                  <label
                    htmlFor="ingest-file"
                    className="inline-flex min-h-[var(--nb-size-control-sm)] cursor-pointer items-center justify-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] bg-[var(--nb-ink)] px-[var(--nb-space-4)] text-xs font-semibold text-[var(--nb-ink-inv)]"
                  >
                    <Upload size={14} aria-hidden="true" />
                    Choose files
                  </label>
                  <input
                    id="ingest-file"
                    type="file"
                    className="sr-only"
                    multiple
                  />
                </div>
              </TabsContent>
              <TabsContent value="url">
                <div className="grid gap-[var(--nb-space-3)] pt-[var(--nb-space-2)]">
                  <FormField
                    label="Web address"
                    hint="Fetched and converted through the web reader."
                  >
                    <Input
                      id="ingest-url"
                      inputMode="url"
                      placeholder="https://example.com/article"
                      autoComplete="off"
                    />
                  </FormField>
                </div>
              </TabsContent>
              <TabsContent value="text">
                <div className="grid gap-[var(--nb-space-3)] pt-[var(--nb-space-2)]">
                  <FormField
                    label="Note text"
                    hint="Saved as a note Source with a NOTE badge."
                  >
                    <textarea
                      id="ingest-note"
                      rows={4}
                      placeholder="Paste or write Markdown…"
                      className="w-full rounded-[var(--nb-radius-input)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-sm text-[var(--nb-ink)] placeholder:text-[var(--nb-ink-3)] focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink)]"
                    />
                  </FormField>
                </div>
              </TabsContent>
            </Tabs>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
);
IngestModal.displayName = "IngestModal";

export { IngestModal };
