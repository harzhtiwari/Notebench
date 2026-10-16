import * as React from "react";
import { cn } from "../../lib/utils.js";

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
          "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] border p-[var(--nb-space-3)] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
            "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
            isSelected
              ? "border-[var(--nb-ink)] bg-[var(--nb-sheet)]"
              : "border-[var(--nb-edge)] bg-[var(--nb-sheet)]"
          )}
        >
          {isSelected ? (
            <span className="h-2 w-2 rounded-full bg-[var(--nb-ink)]" />
          ) : null}
        </span>
      </button>
    );
  }
);
FormatOptionRow.displayName = "FormatOptionRow";

export { FormatOptionRow };
