import * as React from "react";
import type { TargetMilestone } from "@notebook/contracts";
import { Button } from "./button.js";
import { VersionBadge } from "./version-badge.js";
import { cn } from "../../lib/utils.js";

export interface EmptyListItem {
  id?: string | undefined;
  text: string;
  disabled?: boolean | undefined;
}

export interface EmptyListProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode | undefined;
  description?: React.ReactNode | undefined;
  milestone?: TargetMilestone | undefined;
  entityName?: string | undefined;
  items?: readonly (string | EmptyListItem)[] | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

/**
 * EmptyList component for settings and audit views with board .empty styling.
 * Specifically supports inactive Memory Rule lists with "Memory rules arrive in 0.3"
 * and VersionBadge milestone labelling.
 */
export const EmptyList = React.forwardRef<HTMLDivElement, EmptyListProps>(
  (
    {
      className,
      title,
      description,
      milestone = "0.3",
      entityName,
      items,
      actionLabel,
      onAction,
      children,
      ...props
    },
    ref
  ) => {
    const isMemoryRulesDefault = !title && !entityName;
    const resolvedTitle =
      title ?? (isMemoryRulesDefault ? "Memory Rules" : `No ${entityName} yet`);
    const resolvedDescription =
      description ??
      (isMemoryRulesDefault
        ? "A persistent, user-defined instruction or style guideline injected into agent context to govern response tone and formatting."
        : undefined);

    const showMilestoneBadge = isMemoryRulesDefault || Boolean(milestone);

    return (
      <div
        ref={ref}
        className={cn(
          "empty grid gap-[var(--nb-space-3)] justify-items-start rounded-[var(--nb-radius-card)] bg-[var(--nb-well)] p-[var(--nb-space-6)] sm:p-[var(--nb-space-8)] max-w-[var(--nb-layout-modal-sm)] w-full text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
          {showMilestoneBadge && milestone && (
            <VersionBadge milestone={milestone} />
          )}
          {isMemoryRulesDefault && milestone && (
            <span className="text-[length:var(--nb-text-xs)] font-[var(--nb-weight-semibold)] text-[var(--nb-ink-2)]">
              Memory rules arrive in {milestone}
            </span>
          )}
        </div>

        <h4 className="font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-xl)] font-[var(--nb-weight-semibold)] text-[var(--nb-ink)]">
          {resolvedTitle}
        </h4>

        {resolvedDescription && (
          <p className="text-[length:var(--nb-text-sm)] text-[var(--nb-ink-2)]">
            {resolvedDescription}
          </p>
        )}

        {items && items.length > 0 && (
          <ul
            aria-label="Inactive rules list"
            className="w-full grid gap-[var(--nb-space-2)] opacity-75 mt-[var(--nb-space-1)]"
          >
            {items.map((item, idx) => {
              const text = typeof item === "string" ? item : item.text;
              const key =
                typeof item === "string" ? idx : (item.id ?? idx);

              return (
                <li
                  key={key}
                  aria-disabled="true"
                  className="flex items-center justify-between gap-[var(--nb-space-3)] rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-[length:var(--nb-text-sm)] text-[var(--nb-disabled-fg)] select-none cursor-not-allowed"
                >
                  <span>{text}</span>
                  {milestone && <VersionBadge milestone={milestone} />}
                </li>
              );
            })}
          </ul>
        )}

        {actionLabel && onAction && (
          <div className="mt-[var(--nb-space-2)]">
            <Button
              type="button"
              onClick={onAction}
              className="font-[var(--nb-weight-semibold)]"
            >
              {actionLabel}
            </Button>
          </div>
        )}

        {children}
      </div>
    );
  }
);

EmptyList.displayName = "EmptyList";
