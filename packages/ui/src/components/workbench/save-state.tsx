import * as React from "react";
import { Button } from "../primitives/index.js";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "../primitives/icons.js";
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
  autoSave?: AutoSaveConfig | undefined;
}

/**
SaveState: save state indicator and optional autosave orchestrator (ticket 16).
Reuses useAutosave for quiet debounce, ceiling, and retry guarantees.
Never color-alone: icon + textual label always.
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
        } catch (error) {
          autoSave?.onError?.(error);
          throw error;
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
      return autosave.status === "error" ? "error" : "idle";
    }, [explicitStatus, autoSave, autosave.status]);

    if (status === "idle") {
      return null;
    }

    const handleRetry = () => {
      if (onRetry) {
        onRetry();
      } else if (autoSave) {
        void autosave.retry();
      }
    };

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
            <CircleNotchIcon
              size={16}
              weight="bold"
              aria-hidden="true"
              className="animate-spin [animation-duration:var(--nb-dur-spin)] motion-reduce:animate-none text-[var(--nb-ink-3)]"
            />
            <span>Saving...</span>
          </>
        )}

        {status === "saved" && (
          <>
            <CheckIcon size={16} weight="bold" aria-hidden="true" className="text-[var(--nb-ok)]" />
            <span className="text-[var(--nb-ok)]">Saved</span>
          </>
        )}

        {status === "error" && (
          <div className="flex items-center gap-[var(--nb-space-2)] text-[var(--nb-danger)]">
            <WarningCircleIcon size={16} weight="fill" aria-hidden="true" />
            <span>{errorMessage}</span>
            <Button
              variant="nb_btn_ghost"
              size="nb_btn_sm"
              onClick={handleRetry}
              className="px-[var(--nb-space-2)] text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
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
