import * as React from "react";
import { Button } from "../primitives/button.js";
import { cn } from "../../lib/utils.js";

export interface RefusalEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  reason?: "no-sources" | "low-confidence" | "not-found" | string | undefined;
  title?: string | undefined;
  message?: string | undefined;
  topic?: string | undefined;
  availableTopics?: readonly string[] | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  actions?: React.ReactNode | undefined;
}

/**
 * Tier-1 refusal empty state (board `.empty` pattern, Tk 09 / Tk 10).
 * Displays when 0 sources are selected or when fused RRF retrieval score is below 0.015.
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
    if (!resolvedTitle) {
      if (reason === "no-sources") {
        resolvedTitle = "No sources selected";
      } else if (reason === "low-confidence" || reason === "not-found") {
        resolvedTitle = "Not found in sources";
      } else {
        resolvedTitle = "No answer found";
      }
    }

    let resolvedMessage = message;
    if (!resolvedMessage) {
      if (reason === "no-sources") {
        resolvedMessage = "Select at least one source to ground answers and citations.";
      } else if (topic) {
        resolvedMessage = `I couldn't find information about "${topic}" in the selected sources.`;
      } else {
        resolvedMessage = "I couldn't find an answer to your question in the selected sources.";
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "empty grid gap-[var(--nb-space-3)] justify-items-start rounded-[var(--nb-radius-card)] bg-[var(--nb-well)] p-[var(--nb-space-6)] sm:p-[var(--nb-space-8)] max-w-[var(--nb-layout-modal-sm)]",
          className
        )}
        {...props}
      >
        <h4 className="font-[var(--nb-font-read)] text-[length:var(--nb-text-xl)] font-semibold text-[var(--nb-ink)]">
          {resolvedTitle}
        </h4>
        <p className="text-sm text-[var(--nb-ink-2)]">{resolvedMessage}</p>
        {availableTopics && availableTopics.length > 0 ? (
          <p className="text-xs text-[var(--nb-ink-3)]">
            Topics present in sources: {availableTopics.join(", ")}
          </p>
        ) : null}
        {actions ? (
          <div className="flex flex-wrap gap-[var(--nb-space-2)]">{actions}</div>
        ) : actionLabel && onAction ? (
          <div className="flex flex-wrap gap-[var(--nb-space-2)]">
            <Button variant="secondary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
        {children}
      </div>
    );
  }
);
RefusalEmpty.displayName = "RefusalEmpty";
