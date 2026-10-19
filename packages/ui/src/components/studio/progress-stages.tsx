import * as React from "react";
import { CircleIcon, SparkleIcon, CheckCircleIcon, WarningCircleIcon } from "../primitives/icons.js";
import { StatusBadge } from "../primitives/badges.js";
import { CancelButton } from "../primitives/cancel-button.js";
import { cn } from "../../lib/utils.js";

export type StageStatus = "pending" | "active" | "done" | "error";

export interface ProgressStage {
  id?: string | undefined;
  name: string;
  status: StageStatus;
  /**
  Optional secondary text, e.g. "Done in 12 s", "Waiting", or step summary.
  */
  description?: string | undefined;
  /**
  Percentage (0-100) for active stage progress bar.
  */
  progress?: number | undefined;
  /**
  Error message when status is "error".
  */
  error?: string | undefined;
}

export interface ProgressStagesProps
  extends React.HTMLAttributes<HTMLOListElement> {
  stages: ProgressStage[];
  /**
  Optional overall progress percentage (0-100).
  */
  overallProgress?: number | undefined;
  /**
  Accessible label for the progress list. Defaults to "Generation progress".
  */
  label?: string | undefined;
  /**
  Optional cancellation controller.
  */
  controller?: AbortController | undefined;
  /**
  Optional cancellation callback.
  */
  onCancel?: (() => void) | undefined;
}

function StageLeadingIcon({ status }: { status: StageStatus }): React.JSX.Element {
  switch (status) {
    case "done": {
      return (
        <CheckCircleIcon
          size={20}
          weight="fill"
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-ok)]"
        />
      );
    }
    case "active": {
      return (
        <SparkleIcon
          size={20}
          weight="fill"
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-ai)] animate-pulse motion-reduce:animate-none"
        />
      );
    }
    case "error": {
      return (
        <WarningCircleIcon
          size={20}
          weight="fill"
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-danger)]"
        />
      );
    }
    default: {
      return (
        <CircleIcon
          size={20}
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-ink-3)]"
        />
      );
    }
  }
}

/**
Artifact generation progress pattern (Ticket 13).
Composes board `.steps` / `.progress` patterns (`docs/ui/board.test.html:574-577`).
Renders SSE stage list (pending, active, done, error), progress bar, status badges,
and optional cancellation.
*/
const ProgressStages = React.forwardRef<HTMLOListElement, ProgressStagesProps>(
  (
    {
      className,
      stages,
      overallProgress,
      label = "Generation progress",
      controller,
      onCancel,
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full max-w-[var(--nb-layout-modal-sm)] space-y-[var(--nb-space-2)]">
        {overallProgress === undefined ? null : (
          <div className="space-y-[var(--nb-space-1)]">
            <div
              role="progressbar"
              aria-label={label}
              aria-valuenow={overallProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-[var(--nb-size-progress)] w-full overflow-hidden rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)]"
            >
              <i
                aria-hidden="true"
                style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
                className="block h-full rounded-[var(--nb-radius-chip)] bg-[var(--nb-ink)] transition-all duration-[var(--nb-dur-base)] ease-[var(--nb-ease)] motion-reduce:transition-none"
              />
            </div>
          </div>
        )}

        <ol
          ref={ref}
          aria-label={label}
          className={cn(
            "m-0 list-none rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-2)]",
            className
          )}
          {...props}
        >
          {stages.map((stage, index) => {
            const key = stage.id ?? `${stage.name}-${index}`;
            const isError = stage.status === "error";
            const errorMessage = stage.error ?? (isError ? stage.description : undefined);
            const helperText = isError ? undefined : stage.description;

            return (
              <li
                key={key}
                className="grid grid-cols-[var(--nb-size-icon-md)_minmax(0,1fr)] items-start gap-[var(--nb-space-3)] p-[var(--nb-space-3)]"
              >
                <span className="grid h-[var(--nb-size-icon-md)] w-[var(--nb-size-icon-md)] place-items-center">
                  <StageLeadingIcon status={stage.status} />
                </span>

                <div className="grid min-w-0 gap-[var(--nb-space-1)]">
                  <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)]">
                    <span className="step-name text-sm font-semibold text-[var(--nb-ink)]">
                      {stage.name}
                    </span>
                    <StatusBadge status={stage.status} />
                  </div>

                  {helperText === undefined ? null : (
                    <div className="text-xs text-[var(--nb-ink-2)]">{helperText}</div>
                  )}

                  {errorMessage === undefined ? null : (
                    <div className="text-xs text-[var(--nb-danger)]">{errorMessage}</div>
                  )}

                  {stage.progress === undefined ? null : (
                    <div
                      role="progressbar"
                      aria-label={stage.name}
                      aria-valuenow={stage.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-[var(--nb-size-progress)] w-full overflow-hidden rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)]"
                    >
                      <i
                        aria-hidden="true"
                        style={{
                          width: `${Math.min(100, Math.max(0, stage.progress))}%`,
                        }}
                        className="block h-full rounded-[var(--nb-radius-chip)] bg-[var(--nb-ink)] transition-all duration-[var(--nb-dur-base)] ease-[var(--nb-ease)] motion-reduce:transition-none"
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {controller !== undefined || onCancel !== undefined ? (
          <div className="flex justify-end">
            <CancelButton controller={controller} onCancel={onCancel} />
          </div>
        ) : null}
      </div>
    );
  }
);
ProgressStages.displayName = "ProgressStages";

export { ProgressStages };
