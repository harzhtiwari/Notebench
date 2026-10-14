import * as React from "react";
import { cn } from "../lib/utils.js";

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Board pressed state: ink fill carries the meaning, never color-alone. */
  pressed?: boolean | undefined;
  /**
   * Soft-cap variant (amber "50+ sources" chip). Board defines no warn chip,
   * so this keeps the `.chip` shape with warn-wash/warn roles — deviation
   * recorded in the ticket comments.
   */
  variant?: "default" | "warn" | undefined;
}

/**
 * Board `.chip` filter chip (ticket 08): label always, pressed = ink fill.
 * Category filters render in a `role="group"` parent; the soft-cap chip uses
 * `variant="warn"` with the "50+ sources" copy.
 */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, pressed, variant = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-[var(--nb-size-control-sm)] cursor-pointer items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] border border-transparent bg-[var(--nb-well)] px-[var(--nb-space-3)] text-xs font-medium leading-[var(--nb-leading-none)] text-[var(--nb-ink-2)] hover:bg-[var(--nb-well-hover)] aria-pressed:bg-[var(--nb-ink)] aria-pressed:text-[var(--nb-ink-inv)]",
        variant === "warn" &&
          "bg-[var(--nb-warn-wash)] font-semibold text-[var(--nb-warn)] hover:bg-[var(--nb-warn-wash)]",
        className
      )}
      {...props}
    />
  )
);
Chip.displayName = "Chip";

export { Chip };
