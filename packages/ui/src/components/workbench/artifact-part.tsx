import * as React from "react";
import { Sparkle, PencilSimple, Lock, Warning } from "../primitives/icons.js";
import { Badge, type BadgeVariant } from "../primitives/index.js";
import { cn } from "../../lib/utils.js";

export type ArtifactPartState = "ai" | "you" | "locked" | "stale";

export interface ArtifactPartProps extends React.HTMLAttributes<HTMLElement> {
  state: ArtifactPartState;
  stateLabel?: string | undefined;
  blockId?: string | undefined;
  meta?: React.ReactNode | undefined;
  tools?: React.ReactNode | undefined;
  editable?: boolean | undefined;
  bodyProps?: React.HTMLAttributes<HTMLDivElement> | undefined;
}

const DEFAULT_STATE_LABELS: Record<ArtifactPartState, string> = {
  ai: "AI",
  you: "You",
  locked: "Locked",
  stale: "Stale",
};

const STATE_ICONS: Record<ArtifactPartState, React.ReactElement> = {
  ai: <Sparkle size={16} weight="fill" aria-hidden="true" />,
  you: <PencilSimple size={16} weight="fill" aria-hidden="true" />,
  locked: <Lock size={16} weight="fill" aria-hidden="true" />,
  stale: <Warning size={16} weight="fill" aria-hidden="true" />,
};

const STATE_VARIANTS: Record<ArtifactPartState, BadgeVariant> = {
  ai: "ai",
  you: "you",
  locked: "default",
  stale: "warn",
};

const RAIL_CLASSES: Record<ArtifactPartState, string> = {
  ai: "[background:repeating-linear-gradient(to_bottom,var(--nb-ai)_0_var(--nb-space-2),transparent_var(--nb-space-2)_var(--nb-space-3))]",
  you: "bg-[var(--nb-you)]",
  locked: "[background:linear-gradient(to_right,var(--nb-ink)_0_33%,transparent_33%_66%,var(--nb-ink)_66%_100%)]",
  stale: "[background:repeating-linear-gradient(to_bottom,var(--nb-warn)_0_var(--nb-space-1),transparent_var(--nb-space-1)_var(--nb-space-2))]",
};

/**
 * ArtifactPart: board `.part` pattern (ticket 16).
 * Enforces Sibling Invariance and accessibility invariants:
 * NEVER color-alone (rail + icon + label always).
 */
const ArtifactPart = React.forwardRef<HTMLElement, ArtifactPartProps>(
  (
    {
      className,
      state,
      stateLabel,
      blockId,
      meta,
      tools,
      editable = false,
      bodyProps,
      children,
      ...props
    },
    ref
  ) => {
    const labelText = stateLabel ?? DEFAULT_STATE_LABELS[state];

    return (
      <article
        ref={ref}
        data-state={state}
        data-block-id={blockId}
        className={cn(
          "part relative min-w-0 rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] pl-[var(--nb-space-6)] text-[var(--nb-ink)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none",
          className
        )}
        {...props}
      >
        {/* Rail element: never color-alone */}
        <span
          data-slot="rail"
          data-state={state}
          aria-hidden="true"
          className={cn(
            "absolute bottom-[var(--nb-space-3)] left-[var(--nb-space-3)] top-[var(--nb-space-3)] w-[var(--nb-border-rail)] rounded-[var(--nb-radius-rail)]",
            RAIL_CLASSES[state]
          )}
        />

        <div className="part-head flex flex-wrap items-center gap-x-[var(--nb-space-3)] gap-y-[var(--nb-space-2)] pb-[var(--nb-space-2)] pr-[var(--nb-space-3)] pt-[var(--nb-space-2)]">
          {/* State label: icon + label always */}
          <Badge
            data-slot="state-label"
            variant={STATE_VARIANTS[state]}
            icon={STATE_ICONS[state]}
            className="state-label"
          >
            {labelText}
          </Badge>

          {meta !== undefined ? (
            <span className="part-meta text-xs text-[var(--nb-ink-3)]">{meta}</span>
          ) : null}

          {tools !== undefined ? (
            <div className="part-tools ml-auto flex flex-wrap items-center gap-[var(--nb-space-1)]">
              {tools}
            </div>
          ) : null}
        </div>

        <div
          contentEditable={editable}
          suppressContentEditableWarning={editable}
          role={editable ? "textbox" : undefined}
          aria-multiline={editable ? "true" : undefined}
          {...bodyProps}
          className={cn(
            "part-body max-w-[var(--nb-layout-measure)] pb-[var(--nb-space-4)] pr-[var(--nb-space-4)] pt-[var(--nb-space-1)] font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-lg)] leading-[var(--nb-leading-read)]",
            editable && "hover:rounded-[var(--nb-radius-well)] hover:bg-[var(--nb-well)]",
            bodyProps?.className
          )}
        >
          {children}
        </div>
      </article>
    );
  }
);
ArtifactPart.displayName = "ArtifactPart";

export { ArtifactPart };
