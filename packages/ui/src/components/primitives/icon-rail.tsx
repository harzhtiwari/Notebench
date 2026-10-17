import * as React from "react";
import { cn } from "../../lib/utils.js";
import {
  IconButton,
  type ButtonVariant,
  type IconButtonProps,
} from "./button.js";
import { SidebarSimple } from "./icons.js";

export interface IconRailProps
  extends Omit<
    IconButtonProps,
    "aria-label" | "onClick" | "children" | "icon" | "size" | "variant"
  > {
  /** Accessible name, e.g. "Collapse sources". Icon is decorative. */
  label: string;
  onToggle: () => void;
  /** Button style variant. Defaults to canonical "nb_btn_ghost". */
  variant?: ButtonVariant | undefined;
  /** Icon button size. Defaults to canonical "nb_btn_icon_sm". */
  size?: "nb_btn_icon_sm" | "nb_btn_icon_md" | "nb_btn_icon_lg" | undefined;
}

/**
 * Board collapse button (ticket 12): ghost icon-small button carrying the
 * `sidebar-simple` catalog icon (`nb_btn_ghost` / `nb_btn_icon_sm`; board
 * `.btn--ghost .btn--icon .btn--sm` at `:1093` / `:1110`). Stands alone, so
 * it always has an accessible name; the icon itself is decorative.
 */
const IconRail = React.forwardRef<HTMLButtonElement, IconRailProps>(
  (
    {
      className,
      label,
      onToggle,
      type = "button",
      variant = "nb_btn_ghost",
      size = "nb_btn_icon_sm",
      ...props
    },
    ref
  ) => (
    <IconButton
      ref={ref}
      type={type}
      variant={variant}
      size={size}
      icon={SidebarSimple}
      className={className}
      {...props}
      aria-label={label}
      onClick={() => {
        onToggle();
      }}
    />
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
        "grid min-w-0 content-start gap-[var(--nb-space-4)] rounded-[var(--nb-radius-panel)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-3)] text-[var(--nb-ink)] transition-all duration-[var(--nb-dur-slow)] ease-[var(--nb-ease)] motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <div className="mb-[var(--nb-space-3)] flex items-center justify-between gap-[var(--nb-space-3)] px-[var(--nb-space-2)] pt-[var(--nb-space-1)]">
        <h3 className="flex items-center gap-[var(--nb-space-2)] font-ui font-[family-name:var(--nb-font-ui)] text-sm text-[length:var(--nb-text-sm)] font-bold font-[number:var(--nb-weight-bold)] leading-[var(--nb-leading-ui)] text-[var(--nb-ink)]">
          <span>{title}</span>
          {titleSuffix}
        </h3>
        <IconRail
          label={collapseLabel}
          onToggle={onToggleCollapse}
          aria-expanded={!collapsed}
        />
      </div>
      {children}
    </section>
  )
);
WorkspacePanel.displayName = "WorkspacePanel";

export { IconRail, WorkspacePanel };
