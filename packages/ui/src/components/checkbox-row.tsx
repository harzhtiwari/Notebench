import * as React from "react";
import { CheckSquare, Square } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface CheckboxRowProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "role" | "onChange" | "aria-checked"
  > {
  /** Checked state drives the Square/CheckSquare swap. */
  checked: boolean;
  onChange?: ((checked: boolean) => void) | undefined;
}

/**
 * Selection checkbox row (ticket 09): icon + label always, never icon-alone.
 * Deviates from the board `.check` native input on purpose — the ticket names
 * `CheckSquare`/`Square` as the selection affordance, so the checked state
 * swaps the glyph while the visible label carries the meaning. Parent owns
 * scope (only checked Sources ground chat); this owns nothing but the toggle.
 */
const CheckboxRow = React.forwardRef<HTMLButtonElement, CheckboxRowProps>(
  ({ className, checked, onChange, disabled, children, ...props }, ref) => {
    const Icon = checked ? CheckSquare : Square;
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          onChange?.(!checked);
        }}
        className={cn(
          "inline-flex min-h-[var(--nb-size-control-md)] cursor-pointer items-center gap-[var(--nb-space-3)] text-left text-sm text-[var(--nb-ink)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        <Icon
          size={20}
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-ink-2)]"
        />
        <span>{children}</span>
      </button>
    );
  }
);
CheckboxRow.displayName = "CheckboxRow";

export { CheckboxRow };
