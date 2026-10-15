import * as React from "react";
import { CheckCircle } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface DiffViewProps extends React.HTMLAttributes<HTMLDivElement> {
  before?: React.ReactNode | undefined;
  after?: React.ReactNode | undefined;
  beforeTitle?: string | undefined;
  afterTitle?: string | undefined;
  verifyMessage?: React.ReactNode | undefined;
}

/**
 * DiffView: board `.diff` pattern (ticket 16).
 * Renders side-by-side or stacked Before/After diff panes with del/ins formatting
 * plus an optional verification row asserting sibling invariance.
 */
const DiffView = React.forwardRef<HTMLDivElement, DiffViewProps>(
  (
    {
      className,
      before,
      after,
      beforeTitle = "Before",
      afterTitle = "After",
      verifyMessage,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("diff-wrapper flex flex-col", className)} {...props}>
        {children ?? (
          <div className="diff grid grid-cols-1 gap-[var(--nb-space-2)] p-[var(--nb-space-2)] md:grid-cols-2">
            <div className="min-w-0 rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] p-[var(--nb-space-4)] font-[var(--nb-font-read)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]">
              <h4 className="mb-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-xs font-bold leading-[var(--nb-leading-none)] text-[var(--nb-ink-3)]">
                {beforeTitle}
              </h4>
              <div className="diff-pane-content [&_del]:bg-[var(--nb-danger-wash)] [&_del]:text-[var(--nb-ink)] [&_del]:line-through [&_del]:decoration-[var(--nb-border-2)]">
                {before}
              </div>
            </div>

            <div className="min-w-0 rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] p-[var(--nb-space-4)] font-[var(--nb-font-read)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]">
              <h4 className="mb-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-xs font-bold leading-[var(--nb-leading-none)] text-[var(--nb-ink-3)]">
                {afterTitle}
              </h4>
              <div className="diff-pane-content [&_ins]:bg-[var(--nb-ok-wash)] [&_ins]:text-[var(--nb-ink)] [&_ins]:underline [&_ins]:decoration-[var(--nb-border-2)] [&_ins]:underline-offset-[var(--nb-space-1)]">
                {after}
              </div>
            </div>
          </div>
        )}

        {verifyMessage !== undefined ? (
          <div className="verify flex items-center gap-[var(--nb-space-2)] px-[var(--nb-space-4)] py-[var(--nb-space-3)] text-sm font-semibold text-[var(--nb-ok)]">
            <CheckCircle size={18} weight="fill" aria-hidden="true" className="shrink-0" />
            <span>{verifyMessage}</span>
          </div>
        ) : null}
      </div>
    );
  }
);
DiffView.displayName = "DiffView";

export { DiffView };
