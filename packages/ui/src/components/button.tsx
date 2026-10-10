import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--nb-r-control,6px)] text-sm font-medium transition-colors focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink,#14213D)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--nb-ink,#14213D)] text-[var(--nb-ink-inv,#F6F8F9)] hover:opacity-90 shadow-xs",
        destructive:
          "bg-destructive bg-[var(--nb-danger,#8E1B30)] text-[var(--nb-ink-inv,#F6F8F9)] hover:opacity-90 shadow-xs",
        outline:
          "border border-[var(--nb-edge,#B9C2CA)] bg-[var(--nb-sheet,#F6F8F9)] text-[var(--nb-ink,#14213D)] hover:bg-[var(--nb-well,#D8DEE3)]",
        secondary:
          "bg-[var(--nb-well,#D8DEE3)] text-[var(--nb-ink,#14213D)] hover:opacity-80",
        ghost:
          "text-[var(--nb-ink,#14213D)] hover:bg-[var(--nb-well,#D8DEE3)]",
        link:
          "text-[var(--nb-ink,#14213D)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-[var(--nb-r-control,6px)] px-2.5 text-xs",
        lg: "h-9 rounded-[var(--nb-r-control,6px)] px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
