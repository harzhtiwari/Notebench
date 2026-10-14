import * as React from "react";
import { MagnifyingGlass } from "./icons.js";
import { cn } from "../lib/utils.js";

export type SearchInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * Search field in the board `.search` shape: icon + borderless input on a
 * well wash. Always needs an accessible label from the caller.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex min-h-9 items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] border border-[var(--nb-edge)] bg-[var(--nb-well)] px-[var(--nb-space-4)] text-[var(--nb-ink-3)]",
        className
      )}
    >
      <MagnifyingGlass size={16} aria-hidden="true" className="shrink-0" />
      <input
        ref={ref}
        type="search"
        className="min-h-9 w-full min-w-0 flex-1 border-0 bg-transparent font-inherit text-[var(--nb-ink)] placeholder:text-[var(--nb-ink-3)] focus-visible:outline-none"
        {...props}
      />
    </div>
  )
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
