import * as React from "react";
import { Plus } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface CreateCardProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onCreate: (() => void) | undefined;
}

/**
 * Dashed Slot-1 create card (parent ticket 05, 1.26). A real button: fixed
 * first in the grid by the parent. The `+` stays copy beside the icon.
 */
const CreateCard = React.forwardRef<HTMLButtonElement, CreateCardProps>(
  ({ className, onCreate, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        onCreate?.();
      }}
      className={cn(
        "flex min-h-[170px] w-full cursor-pointer flex-col items-center justify-center rounded-[var(--nb-radius-card)] border-2 border-dashed border-[var(--nb-edge)] bg-transparent p-[var(--nb-space-6)] text-center transition-colors hover:border-[var(--nb-ink-2)] hover:bg-[var(--nb-well)]",
        className
      )}
      {...props}
    >
      <span className="mb-[var(--nb-space-2)] grid h-10 w-10 place-items-center rounded-[var(--nb-radius-full)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]">
        <Plus size={20} weight="bold" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-[var(--nb-ink)]">
        + Create New Notebook
      </span>
      <span className="mt-[var(--nb-space-1)] text-xs text-[var(--nb-ink-2)]">
        Instant blank research workspace
      </span>
    </button>
  )
);
CreateCard.displayName = "CreateCard";

export { CreateCard };
