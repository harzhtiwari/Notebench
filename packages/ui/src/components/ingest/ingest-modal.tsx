import * as React from "react";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../primitives/overlays.js";
import { buttonVariants } from "../primitives/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs.js";
import { Chip } from "../primitives/chips.js";
import { DropOverlay } from "./drop-overlay.js";
import { FormField, Input, Textarea } from "../primitives/fields.js";
import {
  FileTextIcon,
  GlobeIcon,
  UploadIcon,
  resolveIconProps,
} from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export type IngestChannel = "upload" | "url" | "text";

export interface IngestModalProps {
  open: boolean;
  onOpenChange?: ((isOpen: boolean) => void) | undefined;
  /**
  Controlled channel. Omit (or use defaultChannel) for uncontrolled.
  */
  channel?: IngestChannel | undefined;
  defaultChannel?: IngestChannel | undefined;
  onChannelChange?: ((channel: IngestChannel) => void) | undefined;
  /**
  Shows the drop feedback over the upload channel while dragging.
  */
  dragActive?: boolean | undefined;
  /**
  Shows the amber soft-cap chip when the notebook holds 50+ Sources.
  */
  capReached?: boolean | undefined;
  /**
  Progress rows slot (per-Source queue states, SSE-driven by the parent).
  */
  children?: React.ReactNode;
}

/**
Source ingest modal (ticket 08): Upload / Web-Link / Paste-Text channels
behind ui Tabs in a Radix dialog (same centred pattern as the lockscreen
modal). Composes `Chip`, `DropOverlay`, `FormField`/`Input`/`Textarea` —
owns no fetching, no queue, no policy; limits and statuses arrive via props
and children.
*/
const IngestModal = React.forwardRef<
  React.ComponentRef<typeof DialogContent>,
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
      <DialogContent ref={ref} size="sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add sources</DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        <DialogBody className="pb-[var(--nb-space-5)]">
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
                <UploadIcon {...resolveIconProps({ size: "sm" })} />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url">
                <GlobeIcon {...resolveIconProps({ size: "sm" })} />
                Web Link
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileTextIcon {...resolveIconProps({ size: "sm" })} />
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
                  className={cn(
                    buttonVariants({ variant: "nb_btn_primary", size: "nb_btn_sm" })
                  )}
                >
                  <UploadIcon {...resolveIconProps({ size: "sm" })} />
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
                  <Textarea
                    id="ingest-note"
                    rows={4}
                    placeholder="Paste or write Markdown…"
                  />
                </FormField>
              </div>
            </TabsContent>
          </Tabs>
          {children}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
);
IngestModal.displayName = "IngestModal";

export { IngestModal };
