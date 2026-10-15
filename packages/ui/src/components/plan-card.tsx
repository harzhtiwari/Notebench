import * as React from "react";
import { Button } from "./button.js";
import { DiffView } from "./diff-view.js";
import { ArrowUp, ArrowDown, PencilSimple } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface PlanStepItem {
  id?: string | undefined;
  title: string;
  description?: React.ReactNode | undefined;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  actions?: React.ReactNode | undefined;
}

export interface PlanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: React.ReactNode | undefined;
  costEstimate?: React.ReactNode | undefined;
  items?: PlanStepItem[] | undefined;
  onApprove?: (() => void) | undefined;
  approveLabel?: string | undefined;
  onEdit?: (() => void) | undefined;
  editLabel?: string | undefined;
  actions?: React.ReactNode | undefined;
}

/**
 * PlanCard: board `.plan` pattern (ticket 16).
 * Shows step outline before expensive generation runs, with reordering,
 * cost estimation, and approve/edit action triggers.
 */
const PlanCard = React.forwardRef<HTMLDivElement, PlanCardProps>(
  (
    {
      className,
      title,
      description,
      costEstimate,
      items,
      onApprove,
      approveLabel = "Approve plan",
      onEdit,
      editLabel = "Edit plan",
      actions,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "plan w-full max-w-[var(--nb-layout-modal-md)] overflow-hidden rounded-[var(--nb-radius-card)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <div className="plan-head p-[var(--nb-space-4)]">
          <h4 className="font-[var(--nb-font-ui)] text-base font-bold leading-[var(--nb-leading-ui)] text-[var(--nb-ink)]">
            {title}
          </h4>
          {description !== undefined ? (
            <p className="mt-[var(--nb-space-1)] text-xs text-[var(--nb-ink-3)]">{description}</p>
          ) : null}
        </div>

        {children ?? (
          <ol className="plan-list m-0 list-none px-[var(--nb-space-2)] [counter-reset:slide]">
            {items?.map((item, index) => (
              <li
                key={item.id ?? index}
                className="grid grid-cols-[var(--nb-space-6)_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] p-[var(--nb-space-2)] hover:bg-[var(--nb-well)] [counter-increment:slide]"
              >
                <span
                  aria-hidden="true"
                  className="text-right text-xs font-bold tabular-nums text-[var(--nb-ink-3)] before:content-[counter(slide)]"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--nb-ink)]">{item.title}</div>
                  {item.description !== undefined ? (
                    <div className="text-xs text-[var(--nb-ink-3)]">{item.description}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-[var(--nb-space-1)]">
                  {item.actions ?? (
                    <>
                      {item.onMoveUp !== undefined ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] rounded-[var(--nb-radius-control)]"
                          onClick={item.onMoveUp}
                          aria-label={`Move step ${index + 1} up`}
                        >
                          <ArrowUp size={14} aria-hidden="true" />
                        </Button>
                      ) : null}
                      {item.onMoveDown !== undefined ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] rounded-[var(--nb-radius-control)]"
                          onClick={item.onMoveDown}
                          aria-label={`Move step ${index + 1} down`}
                        >
                          <ArrowDown size={14} aria-hidden="true" />
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="plan-actions flex flex-wrap items-center gap-[var(--nb-space-2)] p-[var(--nb-space-4)]">
          {costEstimate !== undefined ? (
            <span className="plan-cost mr-auto text-xs text-[var(--nb-ink-3)]">{costEstimate}</span>
          ) : null}
          {actions ?? (
            <>
              {onEdit !== undefined ? (
                <Button variant="ghost" onClick={onEdit}>
                  {editLabel}
                </Button>
              ) : null}
              {onApprove !== undefined ? (
                <Button variant="default" onClick={onApprove}>
                  {approveLabel}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }
);
PlanCard.displayName = "PlanCard";

export interface ReviewCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  icon?: React.ReactNode | undefined;
  before?: React.ReactNode | undefined;
  after?: React.ReactNode | undefined;
  beforeTitle?: string | undefined;
  afterTitle?: string | undefined;
  verifyMessage?: React.ReactNode | undefined;
  steps?: PlanStepItem[] | undefined;
  cost?: React.ReactNode | undefined;
  onKeep?: (() => void) | undefined;
  keepLabel?: string | undefined;
  onUndo?: (() => void) | undefined;
  undoLabel?: string | undefined;
  actions?: React.ReactNode | undefined;
}

/**
 * ReviewCard: board `.review` pattern (ticket 16).
 * Presents surgical block change diffs, verify invariance proof row,
 * and Keep/Undo action triggers.
 */
const ReviewCard = React.forwardRef<HTMLDivElement, ReviewCardProps>(
  (
    {
      className,
      title,
      icon,
      before,
      after,
      beforeTitle = "Before",
      afterTitle = "After",
      verifyMessage,
      steps,
      cost,
      onKeep,
      keepLabel = "Keep change",
      onUndo,
      undoLabel = "Undo",
      actions,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "review w-full max-w-[var(--nb-layout-modal-md)] overflow-hidden rounded-[var(--nb-radius-card)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <div className="review-head flex items-center gap-[var(--nb-space-2)] px-[var(--nb-space-4)] py-[var(--nb-space-3)] font-[var(--nb-font-ui)] text-sm font-bold text-[var(--nb-ink)]">
          {icon ?? <PencilSimple size={16} weight="fill" aria-hidden="true" />}
          <span>{title}</span>
        </div>

        {children ?? (
          <>
            {before !== undefined || after !== undefined || verifyMessage !== undefined ? (
              <DiffView
                before={before}
                after={after}
                beforeTitle={beforeTitle}
                afterTitle={afterTitle}
                verifyMessage={verifyMessage}
              />
            ) : null}
            {steps !== undefined && steps.length > 0 ? (
              <ol className="plan-list m-0 list-none px-[var(--nb-space-2)] [counter-reset:slide]">
                {steps.map((item, index) => (
                  <li
                    key={item.id ?? index}
                    className="grid grid-cols-[var(--nb-space-6)_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] p-[var(--nb-space-2)] hover:bg-[var(--nb-well)] [counter-increment:slide]"
                  >
                    <span
                      aria-hidden="true"
                      className="text-right text-xs font-bold tabular-nums text-[var(--nb-ink-3)] before:content-[counter(slide)]"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--nb-ink)]">{item.title}</div>
                      {item.description !== undefined ? (
                        <div className="text-xs text-[var(--nb-ink-3)]">{item.description}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}

        <div className="review-actions flex flex-wrap items-center gap-[var(--nb-space-2)] px-[var(--nb-space-4)] pb-[var(--nb-space-4)] pt-[var(--nb-space-2)]">
          {cost !== undefined ? (
            <span className="review-cost mr-auto text-xs text-[var(--nb-ink-3)]">{cost}</span>
          ) : null}
          {actions ?? (
            <>
              {onKeep !== undefined ? (
                <Button variant="default" onClick={onKeep}>
                  {keepLabel}
                </Button>
              ) : null}
              {onUndo !== undefined ? (
                <Button variant="secondary" onClick={onUndo}>
                  {undoLabel}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }
);
ReviewCard.displayName = "ReviewCard";

export { PlanCard, ReviewCard };
