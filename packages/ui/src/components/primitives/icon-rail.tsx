import * as React from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import { SidebarSimple } from "./icons.js";

export interface IconRailProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "onClick" | "children"
  > {
  /** Accessible name, e.g. "Collapse sources". Icon is decorative. */
  label: string;
  onToggle: () => void;
}

/**
 * Board collapse button (ticket 12): ghost icon-small button carrying the
 * `sidebar-simple` catalog icon. Stands alone, so it always has an accessible
 * name; the icon itself is decorative.
 */
const IconRail = React.forwardRef<HTMLButtonElement, IconRailProps>(
  ({ className, label, onToggle, type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      type={type}
      variant="ghost"
      size="sm"
      className={cn("w-8 px-0", className)}
      {...props}
      aria-label={label}
      onClick={() => {
        onToggle();
      }}
    >
      <SidebarSimple aria-hidden="true" />
    </Button>
  )
);
IconRail.displayName = "IconRail";

export interface WorkspacePanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Panel title shown in the head row, e.g. "Sources". */
  title: string;
  /** Trailing head content, e.g. a count badge (`Sources 3`, board `:1093`). */
  titleSuffix?: React.ReactNode | undefined;
  collapseLabel: string;
  collapsed?: boolean | undefined;
  onToggleCollapse: () => void;
}

/**
 * Shared side-panel shell (ticket 12): board `.panel` + `.panel-head` shape —
 * title on the left, collapse rail on the right, content below. Both sidebars
 * reuse it; only the title and children differ. Visuals read `var(--nb-*)`.
 */
const WorkspacePanel = React.forwardRef<HTMLElement, WorkspacePanelProps>(
  (
    {
      className,
      title,
      titleSuffix,
      collapseLabel,
      collapsed = false,
      onToggleCollapse,
      children,
      ...props
    },
    ref
  ) => (
    <section
      ref={ref}
      aria-label={title}
      data-collapsed={collapsed}
      className={cn(
        "grid content-start gap-[var(--nb-layout-gutter)] rounded-[var(--nb-radius-panel)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-3)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-[var(--nb-space-3)] px-[var(--nb-space-2)] pt-[var(--nb-space-1)]">
        <h3 className="text-sm font-semibold text-[var(--nb-ink)]">
          {title}
          {titleSuffix}
        </h3>
        <IconRail label={collapseLabel} onToggle={onToggleCollapse} />
      </div>
      {children}
    </section>
  )
);
WorkspacePanel.displayName = "WorkspacePanel";

export { IconRail, WorkspacePanel };
