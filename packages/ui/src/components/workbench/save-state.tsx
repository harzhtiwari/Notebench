import * as React from "react";
import { Button } from "../primitives/button.js";
import { Check, CircleNotch, WarningCircle } from "../primitives/icons.js";
import { autosavePolicy } from "../../lib/autosave-policy.js";
import { useAutosave } from "../../hooks/use-autosave.js";
import { cn } from "../../lib/utils.js";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutoSaveConfig<T = unknown> {
  content: T;
  onSave: (content: T) => Promise<void> | void;
  quietMs?: number | undefined;
  ceilingMs?: number | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

export interface SaveStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "autoSave"> {
  status?: SaveStatus | undefined;
  errorMessage?: string | undefined;
  onRetry?: (() => void) | undefined;
  autoSave?: AutoSaveConfig<unknown> | undefined;
}

/**
 * SaveState: save state indicator and optional autosave orchestrator (ticket 16).
 * Reuses useAutosave for quiet debounce, ceiling, and retry guarantees.
 * Never color-alone: icon + textual label always.
 */
const SaveState = React.forwardRef<HTMLDivElement, SaveStateProps>(
  (
    {
      className,
      status: explicitStatus,
      errorMessage = "Save failed",
      onRetry,
      autoSave,
      ...props
    },
    ref
  ) => {
    const autosave = useAutosave({
      value: autoSave?.content,
      onCommit: async (val) => {
        try {
          if (autoSave?.onSave) {
            await autoSave.onSave(val);
          }
        } catch (err) {
          autoSave?.onError?.(err);
          throw err;
        }
      },
      policy: React.useMemo(
        () => ({
          draftDebounceMs: autosavePolicy.draftDebounceMs,
          commitQuietMs: autoSave?.quietMs ?? autosavePolicy.commitQuietMs,
          commitCeilingMs: autoSave?.ceilingMs ?? autosavePolicy.commitCeilingMs,
        }),
        [autoSave?.quietMs, autoSave?.ceilingMs]
      ),
    });

    const status: SaveStatus = React.useMemo(() => {
      if (explicitStatus !== undefined) return explicitStatus;
      if (!autoSave) return "idle";
      if (autosave.status === "saving") return "saving";
      if (autosave.status === "saved") return "saved";
      if (autosave.status === "error") return "error";
      return "idle";
    }, [explicitStatus, autoSave, autosave.status]);

    const handleRetry = () => {
      if (onRetry) {
        onRetry();
      } else if (autoSave) {
        void autosave.retry();
      }
    };

    if (status === "idle") {
      return null;
    }

    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          "save-state inline-flex items-center gap-[var(--nb-space-2)] text-xs font-medium text-[var(--nb-ink-2)]",
          className
        )}
        {...props}
      >
        {status === "saving" && (
          <>
            <CircleNotch
              size={14}
              aria-hidden="true"
              className="animate-spin text-[var(--nb-ink-3)]"
            />
            <span>Saving...</span>
          </>
        )}

        {status === "saved" && (
          <>
            <Check size={14} aria-hidden="true" className="text-[var(--nb-ok)]" />
            <span className="text-[var(--nb-ok)]">Saved</span>
          </>
        )}

        {status === "error" && (
          <div className="flex items-center gap-[var(--nb-space-2)] text-[var(--nb-danger)]">
            <WarningCircle size={14} weight="fill" aria-hidden="true" />
            <span>{errorMessage}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRetry}
              className="h-6 px-[var(--nb-space-2)] text-xs text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }
);
SaveState.displayName = "SaveState";

export { SaveState };
