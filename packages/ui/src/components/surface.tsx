import * as React from "react";
import { cn } from "../lib/utils.js";

const Sheet = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[var(--nb-r-sheet)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] shadow-xs",
      className
    )}
    {...props}
  />
));
Sheet.displayName = "Sheet";

const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5", className)}
    {...props}
  />
));
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-[var(--nb-ink)]",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--nb-ink-2)]", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
SheetContent.displayName = "SheetContent";

const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0 text-sm text-[var(--nb-ink-2)]", className)}
    {...props}
  />
));
SheetFooter.displayName = "SheetFooter";

const Well = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[var(--nb-r-sheet)] border border-[var(--nb-edge)] bg-[var(--nb-well)] text-[var(--nb-ink)]",
      className
    )}
    {...props}
  />
));
Well.displayName = "Well";

const WellHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4", className)}
    {...props}
  />
));
WellHeader.displayName = "WellHeader";

const WellTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h4
    ref={ref}
    className={cn(
      "text-sm font-semibold leading-none tracking-tight text-[var(--nb-ink)]",
      className
    )}
    {...props}
  />
));
WellTitle.displayName = "WellTitle";

const WellDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--nb-ink-2)]", className)}
    {...props}
  />
));
WellDescription.displayName = "WellDescription";

const WellContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
WellContent.displayName = "WellContent";

const WellFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0 text-xs text-[var(--nb-ink-2)]", className)}
    {...props}
  />
));
WellFooter.displayName = "WellFooter";

export {
  Sheet,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetContent,
  Well,
  WellHeader,
  WellFooter,
  WellTitle,
  WellDescription,
  WellContent,
};
