import * as React from "react";
import { cn } from "../lib/utils.js";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[var(--nb-r-control,6px)] border border-[var(--nb-edge,#B9C2CA)] bg-[var(--nb-sheet,#F6F8F9)] px-3 py-1 text-sm text-[var(--nb-ink,#14213D)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--nb-ink-3,#5B6781)] focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink,#14213D)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
