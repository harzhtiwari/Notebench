import * as React from "react";
import { WarningCircleIcon } from "./icons.js";
import { cn } from "../../lib/utils.js";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
  Board pressed state: ink fill carries the meaning, never color-alone.
  */
  pressed?: boolean | undefined;
  /**
  Soft-cap variant (amber "50+ sources" chip). Board defines no warn chip,
  so this keeps the `.chip` shape with warn-wash/warn roles — deviation
  recorded in the ticket comments.
  */
  variant?: "default" | "warn" | undefined;
}

/**
Board `.chip` filter chip: label always, pressed = ink fill.
Category filters render in a `role="group"` parent; the soft-cap chip uses
`variant="warn"` with the "50+ sources" copy.
*/
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, pressed, variant = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-[var(--nb-size-control-sm)] cursor-pointer items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] border border-transparent bg-[var(--nb-well)] px-[var(--nb-space-3)] text-xs font-medium leading-[var(--nb-leading-none)] font-[family-name:var(--nb-font-ui)] text-[var(--nb-ink-2)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:bg-[var(--nb-well-hover)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] aria-pressed:bg-[var(--nb-ink)] aria-pressed:text-[var(--nb-ink-inv)]",
        variant === "warn" &&
          "bg-[var(--nb-warn-wash)] font-semibold text-[var(--nb-warn)] hover:bg-[var(--nb-warn-wash)]",
        className
      )}
      {...props}
    />
  )
);
Chip.displayName = "Chip";

export interface KeywordFallbackChipProps extends Omit<ChipProps, "variant"> {
  label?: string | undefined;
  detail?: string | undefined;
}

/**
Keyword-fallback chip ("Keyword Search Only…", Tk 09 / L34).
Uses token wash / warning styling (variant="warn") and WarningCircle icon.
*/
export const KeywordFallbackChip = React.forwardRef<
  HTMLButtonElement,
  KeywordFallbackChipProps
>(
  (
    {
      className,
      label = "Keyword Search Only…",
      detail,
      children,
      title = detail ?? "Add an API key or enable local worker for semantic search",
      ...props
    },
    ref
  ) => {
    const text = children ?? (detail ? `${label} · ${detail}` : label);
    return (
      <Chip
        ref={ref}
        variant="warn"
        title={title}
        className={cn("gap-[var(--nb-space-1)]", className)}
        {...props}
      >
        <WarningCircleIcon size={16} weight="fill" aria-hidden="true" />
        <span>{text}</span>
      </Chip>
    );
  }
);
KeywordFallbackChip.displayName = "KeywordFallbackChip";
