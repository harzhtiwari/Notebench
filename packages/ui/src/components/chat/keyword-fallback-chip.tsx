import * as React from "react";
import { Chip, type ChipProps } from "../primitives/chip.js";
import { WarningCircle } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface KeywordFallbackChipProps extends Omit<ChipProps, "variant"> {
  label?: string | undefined;
  detail?: string | undefined;
}

/**
 * Keyword-fallback chip ("Keyword Search Only…", Tk 09 / L34).
 * Uses token wash / warning styling (variant="warn") and WarningCircle icon.
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
        <WarningCircle size={14} weight="fill" aria-hidden="true" />
        <span>{text}</span>
      </Chip>
    );
  }
);
KeywordFallbackChip.displayName = "KeywordFallbackChip";
