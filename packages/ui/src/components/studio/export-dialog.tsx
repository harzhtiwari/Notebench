import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "../primitives/dialog.js";
import { Button } from "../primitives/button.js";
import { Download, X } from "../primitives/icons.js";
import { FormatOptionRow } from "./format-option-row.js";
import { cn } from "../../lib/utils.js";

export interface ExportDialogFormatOption {
  id: string;
  label: string;
  description?: string | undefined;
  icon?:
    | React.ReactNode
    | React.ComponentType<{
        size?: number | string;
        className?: string;
        "aria-hidden"?: boolean | "true" | "false";
      }>
    | undefined;
  disabled?: boolean | undefined;
  value?: string | undefined;
  name?: string | undefined;
}

export interface ExportDialogProps {
  open: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Dialog title, defaults to "Export" */
  title?: string | undefined;
  /** Optional helper description beneath the title */
  description?: string | undefined;
  /** List of export formats to display */
  formats?: ExportDialogFormatOption[] | undefined;
  /** Alias for formats */
  options?: ExportDialogFormatOption[] | undefined;
  /** Preselected format ID (uncontrolled or fallback) */
  defaultFormat?: string | undefined;
  /** Controlled selected format ID */
  selectedFormat?: string | undefined;
  /** Callback when format selection changes */
  onFormatChange?: ((format: string) => void) | undefined;
  /** Callback when primary Export button is clicked */
  onExport?: ((format: string) => void) | undefined;
  /** Label for the export button, defaults to "Export" */
  exportLabel?: string | undefined;
  /** Label for the cancel button, defaults to "Cancel" */
  cancelLabel?: string | undefined;
  /** Whether export is in progress */
  isExporting?: boolean | undefined;
  /** Custom children to render in or alongside the format list */
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}

/**
 * Multi-format export dialog (ticket 19): presents export targets with
 * a preselected default format and an Export action.
 */
const ExportDialog = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ExportDialogProps
>(
  (
    {
      open,
      onOpenChange,
      title = "Export",
      description,
      formats,
      options,
      defaultFormat,
      selectedFormat,
      onFormatChange,
      onExport,
      exportLabel = "Export",
      cancelLabel = "Cancel",
      isExporting = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const formatList = formats ?? options ?? [];
    const [internalFormat, setInternalFormat] = React.useState<string>(() => {
      return (
        defaultFormat ??
        formatList[0]?.id ??
        formatList[0]?.value ??
        ""
      );
    });

    const prevDefaultFormatRef = React.useRef(defaultFormat);
    React.useEffect(() => {
      if (
        prevDefaultFormatRef.current !== defaultFormat &&
        defaultFormat !== undefined
      ) {
        prevDefaultFormatRef.current = defaultFormat;
        setInternalFormat(defaultFormat);
      }
    }, [defaultFormat]);

    const activeFormat =
      selectedFormat !== undefined ? selectedFormat : internalFormat;

    const handleSelect = (formatId: string) => {
      if (selectedFormat === undefined) {
        setInternalFormat(formatId);
      }
      onFormatChange?.(formatId);
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            ref={ref}
            aria-describedby={
              description ? "export-dialog-description" : undefined
            }
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-[min(var(--nb-layout-modal-sm),calc(100%-var(--nb-space-8)))] translate-x-[-50%] translate-y-[-50%] gap-[var(--nb-space-4)] rounded-[var(--nb-radius-modal)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-5)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-modal)]",
              className
            )}
            {...props}
          >
            <div className="dlg-head flex items-start justify-between gap-[var(--nb-space-3)]">
              <div className="grid gap-[var(--nb-space-1)]">
                <DialogTitle>{title}</DialogTitle>
                {description ? (
                  <p
                    id="export-dialog-description"
                    className="text-xs text-[var(--nb-ink-2)]"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="inline-flex min-h-[var(--nb-size-control-sm)] min-w-[var(--nb-size-control-sm)] items-center justify-center rounded-[var(--nb-radius-control)] text-[var(--nb-ink-2)] hover:bg-[var(--nb-well-hover)] focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink)]"
              >
                <X size={16} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <div
              role="radiogroup"
              aria-label={title}
              className="dlg-body grid gap-[var(--nb-space-2)]"
            >
              {formatList.map((item) => {
                const itemId = item.id ?? item.value ?? "";
                const itemLabel = item.label ?? item.name ?? "";
                return (
                  <FormatOptionRow
                    key={itemId}
                    icon={item.icon}
                    label={itemLabel}
                    description={item.description}
                    selected={activeFormat === itemId}
                    disabled={item.disabled}
                    onSelect={() => handleSelect(itemId)}
                  />
                );
              })}
              {children}
            </div>

            <div className="dlg-foot flex items-center justify-end gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="sm">
                  {cancelLabel}
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!activeFormat || isExporting}
                onClick={() => {
                  if (activeFormat) {
                    onExport?.(activeFormat);
                  }
                }}
                className="gap-[var(--nb-space-2)]"
              >
                <Download size={14} aria-hidden="true" />
                <span>{exportLabel}</span>
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    );
  }
);
ExportDialog.displayName = "ExportDialog";

export { ExportDialog };
