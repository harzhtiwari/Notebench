import * as React from "react";
import { cn } from "../lib/utils.js";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[var(--nb-r-control)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-3 py-1 text-sm text-[var(--nb-ink)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--nb-ink-3)] focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
