import * as React from "react";
import type { TargetMilestone } from "@notebench/contracts";

import { Button } from "./button.js";
import { VersionBadge } from "./badges.js";
import { cn } from "../../lib/utils.js";

export interface EmptyStateItem {
  id?: string | undefined;
  text: string;
  disabled?: boolean | undefined;
}

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /**
  Optional icon or graphical badge element placed atop the empty container.
  */
  icon?: React.ReactNode;
  /**
  Primary headline. Rendered in serif read font.
  */
  title: React.ReactNode;
  /**
  Explanatory description. Rendered in UI sans font with ink-2 color.
  */
  description?: React.ReactNode;
  /**
  Target roadmap milestone badge (e.g. "0.2", "0.3").
  */
  milestone?: TargetMilestone | undefined;
  /**
  Optional milestone announcement text (e.g. "Arrives in 0.3").
  */
  milestoneText?: string | undefined;
  /**
  Optional list of disabled/inactive feature preview rows.
  */
  items?: readonly (string | EmptyStateItem)[] | undefined;
  /**
  Optional primary action label.
  */
  actionLabel?: string | undefined;
  /**
  Callback fired when primary action is clicked.
  */
  onAction?: (() => void) | undefined;
  /**
  Optional secondary action label.
  */
  secondaryActionLabel?: string | undefined;
  /**
  Callback fired when secondary action is clicked.
  */
  onSecondaryAction?: (() => void) | undefined;
  /**
  Maximum container width variant. Defaults to "sm" (modal-sm).
  */
  maxWidth?: "sm" | "md" | "lg" | "full" | undefined;
}

export interface EmptyStateMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface EmptyStateTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export interface EmptyStateDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export interface EmptyStateActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface EmptyStateItemsProps extends React.HTMLAttributes<HTMLUListElement> {
  children: React.ReactNode;
}

const MAX_WIDTH_CLASS: Record<NonNullable<EmptyStateProps["maxWidth"]>, string> = {
  sm: "max-w-[var(--nb-layout-modal-sm)]",
  md: "max-w-[var(--nb-layout-modal-md)]",
  lg: "max-w-[var(--nb-layout-modal-lg)]",
  full: "",
};

export const EmptyStateMedia = React.forwardRef<HTMLDivElement, EmptyStateMediaProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center text-[var(--nb-ink)]", className)} {...props}>
      {children}
    </div>
  )
);
EmptyStateMedia.displayName = "EmptyStateMedia";

export const EmptyStateTitle = React.forwardRef<
  HTMLHeadingElement,
  EmptyStateTitleProps
>(({ className, children, ...props }, ref) => (
  <h4
    ref={ref}
    className={cn(
      "font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-xl)] font-semibold text-[var(--nb-ink)]",
      className
    )}
    {...props}
  >
    {children}
  </h4>
));
EmptyStateTitle.displayName = "EmptyStateTitle";

export const EmptyStateDescription = React.forwardRef<
  HTMLParagraphElement,
  EmptyStateDescriptionProps
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "font-[family-name:var(--nb-font-ui)] text-[length:var(--nb-text-sm)] leading-[var(--nb-leading-ui)] text-[var(--nb-ink-2)]",
      className
    )}
    {...props}
  >
    {children}
  </p>
));
EmptyStateDescription.displayName = "EmptyStateDescription";

export const EmptyStateActions = React.forwardRef<
  HTMLDivElement,
  EmptyStateActionsProps
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-wrap items-center gap-[var(--nb-space-2)]", className)}
    {...props}
  >
    {children}
  </div>
));
EmptyStateActions.displayName = "EmptyStateActions";

export const EmptyStateItems = React.forwardRef<HTMLUListElement, EmptyStateItemsProps>(
  ({ className, children, ...props }, ref) => (
    <ul
      ref={ref}
      aria-label="Inactive items list"
      className={cn(
        "mt-[var(--nb-space-1)] grid w-full gap-[var(--nb-space-2)] opacity-75",
        className
      )}
      {...props}
    >
      {children}
    </ul>
  )
);
EmptyStateItems.displayName = "EmptyStateItems";

/**
Unified empty state (board `.empty`, board.test.html#L594-596): recessed well,
card radius, serif title, ink-2 description, and an actions row.
*/
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      milestone,
      milestoneText,
      items,
      actionLabel,
      onAction,
      secondaryActionLabel,
      onSecondaryAction,
      maxWidth = "sm",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isShowMilestoneRow = milestone !== undefined || milestoneText !== undefined;
    const hasPrimaryAction = actionLabel !== undefined && onAction !== undefined;
    const hasSecondaryAction =
      secondaryActionLabel !== undefined && onSecondaryAction !== undefined;

    return (
      <div
        ref={ref}
        className={cn(
          "empty grid justify-items-start gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] bg-[var(--nb-well)] py-[var(--nb-space-8)] px-[var(--nb-space-6)] text-[var(--nb-ink)]",
          MAX_WIDTH_CLASS[maxWidth],
          className
        )}
        {...props}
      >
        {icon === undefined ? null : <EmptyStateMedia>{icon}</EmptyStateMedia>}

        {isShowMilestoneRow ? (
          <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
            {milestone === undefined ? null : <VersionBadge milestone={milestone} />}
            {milestoneText === undefined ? null : (
              <span className="text-[length:var(--nb-text-xs)] font-semibold text-[var(--nb-ink-2)]">
                {milestoneText}
              </span>
            )}
          </div>
        ) : null}

        <EmptyStateTitle>{title}</EmptyStateTitle>

        {description === undefined ? null : (
          <EmptyStateDescription>{description}</EmptyStateDescription>
        )}

        {items !== undefined && items.length > 0 ? (
          <EmptyStateItems>
            {items.map((item, index) => {
              const text = typeof item === "string" ? item : item.text;
              const key = typeof item === "string" ? index : (item.id ?? index);

              return (
                <li
                  key={key}
                  aria-disabled="true"
                  className="flex cursor-not-allowed select-none items-center justify-between gap-[var(--nb-space-3)] rounded-[var(--nb-radius-control)] border-[length:var(--nb-border-1)] border-[var(--nb-hairline)] bg-[var(--nb-sheet)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-[length:var(--nb-text-sm)] text-[var(--nb-disabled-fg)]"
                >
                  <span>{text}</span>
                  {milestone === undefined ? null : <VersionBadge milestone={milestone} />}
                </li>
              );
            })}
          </EmptyStateItems>
        ) : null}

        {hasPrimaryAction || hasSecondaryAction ? (
          <EmptyStateActions>
            {hasPrimaryAction ? (
              <Button variant="nb_btn_primary" onClick={onAction} type="button">
                {actionLabel}
              </Button>
            ) : null}
            {hasSecondaryAction ? (
              <Button
                variant="nb_btn_secondary"
                onClick={onSecondaryAction}
                type="button"
              >
                {secondaryActionLabel}
              </Button>
            ) : null}
          </EmptyStateActions>
        ) : null}

        {children}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export interface EmptyListProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode | undefined;
  description?: React.ReactNode | undefined;
  milestone?: TargetMilestone | undefined;
  entityName?: string | undefined;
  items?: readonly (string | EmptyStateItem)[] | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

/**
Backward-compatible adapter for the former empty-list primitive: settings and
audit screens rely on the default "Memory Rules" copy and milestone badge.
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
    const isMemoryRulesDefault = title === undefined && entityName === undefined;
    const resolvedTitle =
      title ?? (isMemoryRulesDefault ? "Memory Rules" : `No ${entityName} yet`);
    const resolvedDescription =
      description ??
      (isMemoryRulesDefault
        ? "A persistent, user-defined instruction or style guideline injected into agent context to govern response tone and formatting."
        : undefined);

    const resolvedMilestone = milestone;
    const milestoneText =
      isMemoryRulesDefault
        ? `Memory rules arrive in ${milestone}`
        : undefined;

    return (
      <EmptyState
        ref={ref}
        className={cn("w-full", className)}
        title={resolvedTitle}
        description={resolvedDescription}
        milestone={resolvedMilestone}
        milestoneText={milestoneText}
        items={items}
        actionLabel={actionLabel}
        onAction={onAction}
        {...props}
      >
        {children}
      </EmptyState>
    );
  }
);
EmptyList.displayName = "EmptyList";

export interface RefusalEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  reason?: string | undefined;
  title?: string | undefined;
  message?: string | undefined;
  topic?: string | undefined;
  availableTopics?: readonly string[] | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  actions?: React.ReactNode | undefined;
}

/**
Backward-compatible adapter for the chat refusal empty state (Tk 09 / Tk 10):
0 sources selected, or fused RRF retrieval score below the confidence floor.
*/
export const RefusalEmpty = React.forwardRef<HTMLDivElement, RefusalEmptyProps>(
  (
    {
      className,
      reason,
      title,
      message,
      topic,
      availableTopics,
      actionLabel,
      onAction,
      actions,
      children,
      ...props
    },
    ref
  ) => {
    let resolvedTitle = title;
    if (resolvedTitle === undefined) {
      if (reason === "no-sources") {
        resolvedTitle = "No sources selected";
      } else if (reason === "low-confidence" || reason === "not-found") {
        resolvedTitle = "Not found in sources";
      } else {
        resolvedTitle = "No answer found";
      }
    }

    let resolvedMessage = message;
    if (resolvedMessage === undefined) {
      if (reason === "no-sources") {
        resolvedMessage = "Select at least one source to ground answers and citations.";
      } else if (topic === undefined) {
        resolvedMessage =
          "I couldn't find an answer to your question in the selected sources.";
      } else {
        resolvedMessage = `I couldn't find information about "${topic}" in the selected sources.`;
      }
    }

    return (
      <EmptyState
        ref={ref}
        className={className}
        title={resolvedTitle}
        description={resolvedMessage}
        {...props}
      >
        {availableTopics !== undefined && availableTopics.length > 0 ? (
          <p className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-3)]">
            Topics present in sources: {availableTopics.join(", ")}
          </p>
        ) : null}
        {actions === undefined ? (actionLabel !== undefined && onAction !== undefined ? (
          <EmptyStateActions>
            <Button variant="nb_btn_secondary" size="nb_btn_sm" onClick={onAction} type="button">
              {actionLabel}
            </Button>
          </EmptyStateActions>
        ) : null) : (
          <EmptyStateActions>{actions}</EmptyStateActions>
        )}
        {children}
      </EmptyState>
    );
  }
);
RefusalEmpty.displayName = "RefusalEmpty";
