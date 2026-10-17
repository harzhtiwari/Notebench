import * as React from "react";
import type { ArtifactType } from "@notebench/contracts";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "../primitives/dropdown-menu.js";
import { Button } from "../primitives/button.js";
import { Download } from "../primitives/icons.js";

export type ExportFormat = "markdown" | "text" | "json" | "csv" | "anki";

export interface ExportFormatOption {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType?: string | undefined;
  description?: string | undefined;
}

export interface ExportMenuProps {
  /** The artifact type to determine which export formats to offer. */
  artifactType?: ArtifactType | string | null | undefined;
  /** Callback fired when an export format is selected. */
  onExport?: ((format: ExportFormat, option: ExportFormatOption) => void) | undefined;
  /** Optional secondary callback when an export format is selected. */
  onSelect?: ((format: ExportFormat, option: ExportFormatOption) => void) | undefined;
  /** Optional custom formats to override the default filtered list. */
  formats?: ExportFormatOption[] | undefined;
  /** Custom trigger element. If omitted, renders a secondary Button with Download icon. */
  trigger?: React.ReactNode | undefined;
  /** Custom trigger children (alternate slot). */
  children?: React.ReactNode | undefined;
  /** Text label on default trigger button. Defaults to "Export". */
  buttonLabel?: string | undefined;
  /** Controlled open state. */
  open?: boolean | undefined;
  /** Controlled open state change callback. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Alignment of the dropdown menu content. Defaults to "end". */
  align?: "start" | "center" | "end" | undefined;
  /** Class name passed to default trigger button. */
  triggerClassName?: string | undefined;
  /** Class name passed to dropdown menu content. */
  contentClassName?: string | undefined;
  /** Optional label text at the top of the menu. Defaults to undefined (no header). */
  label?: string | undefined;
  /** Disabled state for trigger. */
  disabled?: boolean | undefined;
}

/**
 * Resolves standard export formats filtered by artifact type.
 * Strict invariant: Anki format is ONLY offered for flashcard artifacts.
 */
export function getExportFormatsForArtifactType(
  artifactType?: ArtifactType | string | null | undefined
): ExportFormatOption[] {
  const baseFormats: ExportFormatOption[] = [
    {
      format: "markdown",
      label: "Markdown",
      extension: ".md",
      mimeType: "text/markdown",
    },
    {
      format: "text",
      label: "Plain text",
      extension: ".txt",
      mimeType: "text/plain",
    },
    {
      format: "json",
      label: "JSON",
      extension: ".json",
      mimeType: "application/json",
    },
  ];

  if (artifactType === "flashcards") {
    return [
      ...baseFormats,
      {
        format: "csv",
        label: "CSV",
        extension: ".csv",
        mimeType: "text/csv",
      },
      {
        format: "anki",
        label: "Anki deck",
        extension: ".txt",
        mimeType: "text/tab-separated-values",
      },
    ];
  }

  if (artifactType === "quiz" || artifactType === "timeline") {
    return [
      ...baseFormats,
      {
        format: "csv",
        label: "CSV",
        extension: ".csv",
        mimeType: "text/csv",
      },
    ];
  }

  return baseFormats;
}

/**
 * Reusable Export menu (Ticket 18).
 * Reuses DropdownMenu primitive with format options filtered by artifact type.
 */
export function ExportMenu({
  artifactType,
  onExport,
  onSelect,
  formats: customFormats,
  trigger,
  children,
  buttonLabel = "Export",
  open,
  onOpenChange,
  align = "end",
  triggerClassName,
  contentClassName,
  label,
  disabled = false,
}: ExportMenuProps) {
  const options = React.useMemo(() => {
    return customFormats ?? getExportFormatsForArtifactType(artifactType);
  }, [customFormats, artifactType]);

  const handleSelect = React.useCallback(
    (option: ExportFormatOption) => {
      onExport?.(option.format, option);
      onSelect?.(option.format, option);
    },
    [onExport, onSelect]
  );

  const triggerNode = trigger ?? children ?? (
    <Button
      type="button"
      variant="nb_btn_secondary"
      size="nb_btn_sm"
      leadingIcon={Download}
      disabled={disabled}
      className={triggerClassName}
    >
      {buttonLabel}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {triggerNode}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        {label ? (
          <>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {options.map((option) => (
          <DropdownMenuItem
            key={option.format}
            data-format={option.format}
            onSelect={() => handleSelect(option)}
          >
            <span>{option.label}</span>
            {option.extension ? (
              <DropdownMenuShortcut>{option.extension}</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

ExportMenu.displayName = "ExportMenu";
