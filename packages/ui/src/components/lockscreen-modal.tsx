import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "./button.js";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "./dialog.js";
import { FormField } from "./form-field.js";
import { Lock } from "./icons.js";
import { PasswordInput } from "./password-input.js";
import { cn } from "../lib/utils.js";

export interface LockscreenModalProps {
  open: boolean;
  /** Whole seconds left on the server-driven lockout. Submit is blocked above 0. */
  lockedSecondsRemaining?: number | undefined;
  /** Server rejection text (wrong passcode, breached list). Shown on the field. */
  error?: string | undefined;
  /** Remaining attempts before lockout, when the server reports it. */
  attemptsRemaining?: number | undefined;
  onUnlock: ((passcode: string) => void) | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Reusable lockscreen: centred non-dismissable modal with a passcode field
 * and a lockout countdown. Composes ticket-04 `FormField`/`PasswordInput`
 * (owns no inputs itself). Presentational only — the lockout policy and the
 * authoritative remaining time come from the server via props.
 */
const LockscreenModal = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  LockscreenModalProps
>(
  (
    {
      open,
      lockedSecondsRemaining = 0,
      error,
      attemptsRemaining,
      onUnlock,
      onOpenChange,
      ...props
    },
    ref
  ) => {
    const [passcode, setPasscode] = React.useState("");
    const locked = lockedSecondsRemaining > 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            ref={ref}
            aria-describedby={undefined}
            onPointerDownOutside={(event) => {
              if (locked) {
                event.preventDefault();
              }
            }}
            onEscapeKeyDown={(event) => {
              if (locked) {
                event.preventDefault();
              }
            }}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-[min(var(--nb-layout-modal-sm),calc(100%-var(--nb-space-8)))] translate-x-[-50%] translate-y-[-50%] gap-[var(--nb-space-4)] rounded-[var(--nb-radius-modal)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-6)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-modal)]"
            )}
            {...props}
          >
            <div className="grid justify-items-center gap-[var(--nb-space-2)] text-center">
              <span className="grid h-10 w-10 place-items-center rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] text-[var(--nb-ink-2)]">
                <Lock size={20} aria-hidden="true" />
              </span>
              <DialogTitle>Unlock Notebench</DialogTitle>
              <p className="text-xs text-[var(--nb-ink-2)]">
                Enter your passcode to continue.
              </p>
            </div>
            <form
              className="grid gap-[var(--nb-space-4)]"
              onSubmit={(event) => {
                event.preventDefault();
                if (!locked) {
                  onUnlock?.(passcode);
                }
              }}
            >
              <FormField
                label="Passcode"
                error={error}
                hint={
                  attemptsRemaining !== undefined && error === undefined
                    ? `${attemptsRemaining} attempts remaining.`
                    : undefined
                }
              >
                <PasswordInput
                  id="lockscreen-passcode"
                  value={passcode}
                  onChange={(event) => {
                    setPasscode(event.target.value);
                  }}
                  disabled={locked}
                  autoComplete="current-password"
                />
              </FormField>
              {locked ? (
                <p
                  role="status"
                  className="text-center text-xs font-semibold text-[var(--nb-warn)]"
                >
                  Locked. Try again in{" "}
                  {formatCountdown(lockedSecondsRemaining)}.
                </p>
              ) : null}
              <Button type="submit" disabled={locked} className="w-full">
                Unlock
              </Button>
            </form>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    );
  }
);
LockscreenModal.displayName = "LockscreenModal";

export { LockscreenModal };
