import * as React from "react";
import { cn } from "../../lib/utils.js";

// ============================================================================
// CONCENTRIC RADIUS COMPUTATION
// ============================================================================

export type RadiusRole = "panel" | "card" | "well" | "tag" | "control";

const RADIUS_PIXELS: Record<RadiusRole, number> = {
  // Pixel mirror of tokens.json radius-role (panel/card/well/tag/control = xl/lg/md/xs/full).
  // Concentric math needs numbers, not CSS variables; keep in sync with tokens.json.
  panel: 24,
  card: 16,
  well: 12,
  control: 9999,
  tag: 4,
};

export function getNestedRadius(parent: RadiusRole, paddingPx: number): "xs" | "sm" | "md" | "lg" {
  const parentPx = RADIUS_PIXELS[parent];
  const targetPx = Math.max(parentPx - paddingPx, 4);
  if (targetPx <= 4) return "xs";
  if (targetPx <= 8) return "sm";
  if (targetPx <= 12) return "md";
  return "lg";
}

export function concentricRadiusClass(parent: RadiusRole, paddingPx: number): string {
  const step = getNestedRadius(parent, paddingPx);
  return `rounded-[var(--nb-radius-${step})]`;
}

// ============================================================================
// PANEL PRIMITIVE (board.test.html:390)
// ============================================================================

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, as: Component = "div", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(
        "panel min-w-0 rounded-[var(--nb-radius-panel)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] p-[var(--nb-space-4)] sm:p-[var(--nb-space-6)]",
        className
      )}
      {...props}
    />
  )
);
Panel.displayName = "Panel";

export const PanelHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("panel-head flex flex-col gap-[var(--nb-space-1)] pb-[var(--nb-space-3)]", className)}
      {...props}
    />
  )
);
PanelHeader.displayName = "PanelHeader";

export interface PanelTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4";
}

export const PanelTitle = React.forwardRef<HTMLHeadingElement, PanelTitleProps>(
  ({ className, as: Component = "h2", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn("font-ui text-lg font-semibold tracking-tight text-[var(--nb-ink)] leading-[var(--nb-leading-tight)]", className)}
      {...props}
    />
  )
);
PanelTitle.displayName = "PanelTitle";

export const PanelDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("font-ui text-sm text-[var(--nb-ink-2)] leading-[var(--nb-leading-ui)]", className)}
      {...props}
    />
  )
);
PanelDescription.displayName = "PanelDescription";

export const PanelContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0 flex-1", className)} {...props} />
  )
);
PanelContent.displayName = "PanelContent";

export const PanelFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-[var(--nb-space-3)] pt-[var(--nb-space-3)] border-t border-[var(--nb-hairline)] text-sm text-[var(--nb-ink-2)]", className)}
      {...props}
    />
  )
);
PanelFooter.displayName = "PanelFooter";

// ============================================================================
// CARD PRIMITIVE (board.test.html:859)
// ============================================================================

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  /** When true, enables interactive hover boundary (hover:border-[var(--nb-edge)]) and cursor-pointer */
  interactive?: boolean;
  /** When selected (e.g. selected source or card), renders active select styling */
  selected?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, as: Component = "div", interactive = false, selected = false, ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(
        "card min-w-0 rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] p-[var(--nb-space-4)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none",
        interactive && "hover:border-[var(--nb-edge)] cursor-pointer",
        selected && "border-[var(--nb-edge)] ring-1 ring-[var(--nb-edge)]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-[var(--nb-space-1)] pb-[var(--nb-space-2)]", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4" | "h5";
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Component = "h3", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn("font-ui text-md font-semibold text-[var(--nb-ink)] leading-[var(--nb-leading-tight)]", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("font-ui text-sm text-[var(--nb-ink-2)] leading-[var(--nb-leading-ui)]", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-[var(--nb-space-2)] pt-[var(--nb-space-3)] text-xs text-[var(--nb-ink-2)]", className)}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

// ============================================================================
// WELL PRIMITIVE (board.test.html:392)
// ============================================================================

export interface WellProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  /** When true, adds hairline border. Default is false (recessed cut with no border). */
  bordered?: boolean;
  /** When true, adds hover effect: bg-[var(--nb-well-hover)] and cursor-pointer */
  interactive?: boolean;
}

export const Well = React.forwardRef<HTMLDivElement, WellProps>(
  ({ className, as: Component = "div", bordered = false, interactive = false, ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(
        "well min-w-0 rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] text-[var(--nb-ink)] p-[var(--nb-space-4)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none",
        bordered && "border border-[var(--nb-hairline)]",
        interactive && "hover:bg-[var(--nb-well-hover)] cursor-pointer",
        className
      )}
      {...props}
    />
  )
);
Well.displayName = "Well";

export const WellHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-[var(--nb-space-1)] pb-[var(--nb-space-2)]", className)}
      {...props}
    />
  )
);
WellHeader.displayName = "WellHeader";

export interface WellTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h3" | "h4" | "h5" | "h6";
}

export const WellTitle = React.forwardRef<HTMLHeadingElement, WellTitleProps>(
  ({ className, as: Component = "h4", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn("font-ui text-sm font-semibold tracking-tight text-[var(--nb-ink)] leading-[var(--nb-leading-tight)]", className)}
      {...props}
    />
  )
);
WellTitle.displayName = "WellTitle";

export const WellDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("font-ui text-xs text-[var(--nb-ink-2)] leading-[var(--nb-leading-ui)]", className)}
      {...props}
    />
  )
);
WellDescription.displayName = "WellDescription";

export const WellContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0", className)} {...props} />
  )
);
WellContent.displayName = "WellContent";

export const WellFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-[var(--nb-space-2)] pt-[var(--nb-space-2)] text-xs text-[var(--nb-ink-2)]", className)}
      {...props}
    />
  )
);
WellFooter.displayName = "WellFooter";

// ============================================================================
// SHEET PRIMITIVE (Paper container / Dialog base)
// ============================================================================

export interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ className, as: Component = "div", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(
        "sheet min-w-0 rounded-[var(--nb-radius-panel)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] p-[var(--nb-space-4)] sm:p-[var(--nb-space-6)]",
        className
      )}
      {...props}
    />
  )
);
Sheet.displayName = "Sheet";

export const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-[var(--nb-space-1)] pb-[var(--nb-space-3)]", className)}
      {...props}
    />
  )
);
SheetHeader.displayName = "SheetHeader";

export interface SheetTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4";
}

export const SheetTitle = React.forwardRef<HTMLHeadingElement, SheetTitleProps>(
  ({ className, as: Component = "h3", ...props }, ref) => (
    <Component
      ref={ref}
      className={cn("font-ui text-lg font-semibold tracking-tight text-[var(--nb-ink)] leading-[var(--nb-leading-tight)]", className)}
      {...props}
    />
  )
);
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("font-ui text-sm text-[var(--nb-ink-2)] leading-[var(--nb-leading-ui)]", className)}
      {...props}
    />
  )
);
SheetDescription.displayName = "SheetDescription";

export const SheetContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0 flex-1", className)} {...props} />
  )
);
SheetContent.displayName = "SheetContent";

export const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-[var(--nb-space-3)] pt-[var(--nb-space-3)] border-t border-[var(--nb-hairline)] text-sm text-[var(--nb-ink-2)]", className)}
      {...props}
    />
  )
);
SheetFooter.displayName = "SheetFooter";
