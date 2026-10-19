import * as React from "react";
import { PlusIcon, resolveIconProps } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface CreateCardProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onCreate: (() => void) | undefined;
}

/**
Dashed Slot-1 create card (parent ticket 05, 1.26). A real button: fixed
first in the grid by the parent. The `+` stays copy beside the icon.
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
        "flex min-h-[170px] w-full cursor-pointer flex-col items-center justify-center rounded-[var(--nb-radius-card)] border-2 border-dashed border-[var(--nb-edge)] bg-transparent p-[var(--nb-space-6)] text-center transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:border-[var(--nb-ink-2)] hover:bg-[var(--nb-well)] focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-solid focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
        className
      )}
      {...props}
    >
      <span className="mb-[var(--nb-space-2)] grid h-[var(--nb-size-logo)] w-[var(--nb-size-logo)] place-items-center rounded-[var(--nb-radius-chip)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]">
        <PlusIcon {...resolveIconProps({ size: "md", weight: "bold" })} />
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
