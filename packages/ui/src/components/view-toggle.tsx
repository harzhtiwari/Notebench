import * as React from "react";
import { Button } from "./button.js";
import { GridFour, List } from "./icons.js";
import { cn } from "../lib/utils.js";

export type DashboardView = "grid" | "list";

export interface ViewToggleProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: DashboardView;
  onChange: ((view: DashboardView) => void) | undefined;
}

/**
 * Grid/list switch in the board `.seg` shape: pressed state carries the
 * meaning (ink fill), never icon-alone — each side keeps its text label.
 */
const ViewToggle = React.forwardRef<HTMLDivElement, ViewToggleProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const optionClass = (active: boolean): string =>
      active
        ? "bg-[var(--nb-ink)] text-[var(--nb-ink-inv)]"
        : "text-[var(--nb-ink-2)]";
    return (
      <div
        ref={ref}
        role="group"
        aria-label="View"
        className={cn(
          "inline-flex rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-0-5)]",
          className
        )}
        {...props}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Grid view"
          aria-pressed={value === "grid"}
          onClick={() => {
            onChange?.("grid");
          }}
          className={cn("gap-[var(--nb-space-2)]", optionClass(value === "grid"))}
        >
          <GridFour size={16} aria-hidden="true" />
          Grid
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="List view"
          aria-pressed={value === "list"}
          onClick={() => {
            onChange?.("list");
          }}
          className={cn("gap-[var(--nb-space-2)]", optionClass(value === "list"))}
        >
          <List size={16} aria-hidden="true" />
          List
        </Button>
      </div>
    );
  }
);
ViewToggle.displayName = "ViewToggle";

export { ViewToggle };
