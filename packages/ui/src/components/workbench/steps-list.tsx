import * as React from "react";
import { CheckCircleIcon, CircleIcon, CircleNotchIcon, WarningCircleIcon } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export type StepStatus = "done" | "running" | "waiting" | "error";

export interface StepItem {
  id?: string | undefined;
  name: string;
  description?: React.ReactNode | undefined;
  status: StepStatus;
  progress?: number | undefined;
  progressLabel?: string | undefined;
}

export interface StepsListProps extends React.OlHTMLAttributes<HTMLOListElement> {
  items?: StepItem[] | undefined;
}

const STEP_ICONS: Record<StepStatus, React.ReactElement> = {
  done: (
    <CheckCircleIcon
      size={20}
      weight="fill"
      aria-hidden="true"
      className="text-[var(--nb-ok)] shrink-0 mt-[var(--nb-space-0-5)]"
    />
  ),
  running: (
    <CircleNotchIcon
      size={20}
      aria-hidden="true"
      className="animate-spin [animation-duration:var(--nb-dur-spin)] motion-reduce:animate-none text-[var(--nb-ink)] shrink-0 mt-[var(--nb-space-0-5)]"
    />
  ),
  waiting: (
    <CircleIcon
      size={20}
      aria-hidden="true"
      className="text-[var(--nb-ink-3)] shrink-0 mt-[var(--nb-space-0-5)]"
    />
  ),
  error: (
    <WarningCircleIcon
      size={20}
      weight="fill"
      aria-hidden="true"
      className="text-[var(--nb-danger)] shrink-0 mt-[var(--nb-space-0-5)]"
    />
  ),
};

/**
StepsList: board `.steps` pattern (ticket 16).
Renders an ordered list of execution or background pipeline steps
with status icons, descriptions, and progress bar.
*/
const StepsList = React.forwardRef<HTMLOListElement, StepsListProps>(
  ({ className, items, children, ...props }, ref) => {
    return (
      <ol
        ref={ref}
        className={cn(
          "steps m-0 w-full max-w-[var(--nb-layout-modal-sm)] list-none rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-2)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        {children ??
          items?.map((item, index) => (
            <li
              key={item.id ?? index}
              className="grid grid-cols-[var(--nb-size-icon-md)_minmax(0,1fr)] items-start gap-[var(--nb-space-3)] p-[var(--nb-space-3)]"
            >
              {STEP_ICONS[item.status]}
              <div className="min-w-0">
                <div className="step-name text-sm font-semibold text-[var(--nb-ink)]">
                  {item.name}
                </div>
                {item.status === "running" && item.progress !== undefined ? (
                  <div
                    className="progress mt-[var(--nb-space-1)] h-[var(--nb-size-progress)] w-full overflow-hidden rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)]"
                    role="progressbar"
                    aria-label={item.progressLabel ?? item.name}
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i
                      className="block h-full rounded-[var(--nb-radius-chip)] bg-[var(--nb-ink)] transition-all duration-[var(--nb-dur-base)] ease-[var(--nb-ease)] motion-reduce:transition-none"
                      style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                    />
                  </div>
                ) : null}
                {item.description === undefined ? null : (
                  <div className="help mt-[var(--nb-space-0-5)] text-xs text-[var(--nb-ink-3)]">
                    {item.description}
                  </div>
                )}
              </div>
            </li>
          ))}
      </ol>
    );
  }
);
StepsList.displayName = "StepsList";

export { StepsList };
