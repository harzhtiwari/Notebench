import * as React from "react";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../primitives/overlays.js";
import { Button } from "../primitives/button.js";
import { Download } from "../primitives/icons.js";
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

export interface FormatOptionRowProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "role" | "aria-checked"
  > {
  /** Format icon component or React element (Archive, FileZip, FileDoc, etc.). */
  icon?:
    | React.ReactNode
    | React.ComponentType<{
        size?: number | string;
        className?: string;
        "aria-hidden"?: boolean | "true" | "false";
      }>
    | undefined;
  /** Primary label for the format (e.g. "ZIP archive", "DOCX"). */
  label?: React.ReactNode | undefined;
  /** Explanatory description below the label. */
  description?: React.ReactNode | undefined;
  /** Whether this format option is currently selected. */
  selected?: boolean | undefined;
  /** Alias for selected. */
  checked?: boolean | undefined;
  /** Callback when option is selected. */
  onSelect?: (() => void) | undefined;
}

function renderIcon(icon: FormatOptionRowProps["icon"]) {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  if (typeof icon === "function" || typeof icon === "object") {
    const IconComp = icon as React.ComponentType<{
      size?: number | string;
      className?: string;
      "aria-hidden"?: boolean | "true" | "false";
    }>;
    return <IconComp size={20} aria-hidden="true" />;
  }
  return null;
}

/**
 * Format option row (ticket 19): selectable row showing format icon,
 * label, description, and selection radio indicator.
 */
const FormatOptionRow = React.forwardRef<
  HTMLButtonElement,
  FormatOptionRowProps
>(
  (
    {
      className,
      icon,
      label,
      description,
      selected,
      checked,
      onSelect,
      onClick,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isSelected = Boolean(selected ?? checked);
    const displayLabel = label ?? children;

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={isSelected}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          onSelect?.();
        }}
        className={cn(
          "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] border p-[var(--nb-space-3)] text-left transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-solid focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] disabled:cursor-not-allowed disabled:border-[var(--nb-hairline)] disabled:bg-[var(--nb-disabled-bg)] disabled:text-[var(--nb-disabled-fg)]",
          isSelected
            ? "border-[var(--nb-ink)] bg-[var(--nb-well)] text-[var(--nb-ink)]"
            : "border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] hover:bg-[var(--nb-well-hover)]",
          className
        )}
        {...props}
      >
        {icon ? (
          <span className="grid h-[var(--nb-size-tile-icon)] w-[var(--nb-size-tile-icon)] shrink-0 place-items-center rounded-[var(--nb-radius-menu)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink-2)]">
            {renderIcon(icon)}
          </span>
        ) : null}
        <div className="grid min-w-0 gap-[var(--nb-space-0-5)]">
          <div className="truncate text-sm font-semibold text-[var(--nb-ink)]">
            {displayLabel}
          </div>
          {description !== undefined ? (
            <div className="text-xs text-[var(--nb-ink-3)]">
              {description}
            </div>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "grid h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0 place-items-center rounded-[var(--nb-radius-control)] border transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none",
            isSelected
              ? "border-[var(--nb-ink)] bg-[var(--nb-sheet)]"
              : "border-[var(--nb-edge)] bg-[var(--nb-sheet)]"
          )}
        >
          {isSelected ? (
            <span className="h-[var(--nb-space-2)] w-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] bg-[var(--nb-ink)]" />
          ) : null}
        </span>
      </button>
    );
  }
);
FormatOptionRow.displayName = "FormatOptionRow";

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
  React.ElementRef<typeof DialogContent>,
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
        <DialogContent
          ref={ref}
          size="sm"
          aria-describedby={
            description ? "export-dialog-description" : undefined
          }
          className={className}
          {...props}
        >
          <DialogHeader>
            <div className="grid min-w-0 gap-[var(--nb-space-1)]">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription id="export-dialog-description">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
            <DialogCloseButton />
          </DialogHeader>

          <DialogBody
            role="radiogroup"
            aria-label={title}
            className="gap-[var(--nb-space-2)]"
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
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="nb_btn_ghost" size="nb_btn_sm">
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="nb_btn_primary"
              size="nb_btn_sm"
              leadingIcon={Download}
              disabled={!activeFormat || isExporting}
              onClick={() => {
                if (activeFormat) {
                  onExport?.(activeFormat);
                }
              }}
            >
              {exportLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
ExportDialog.displayName = "ExportDialog";

export { ExportDialog, FormatOptionRow };
