import * as React from "react";
import { Button } from "../primitives/button.js";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../primitives/overlays.js";
import type { DialogContentProps } from "../primitives/overlays.js";
import { FormField, PasswordInput } from "../primitives/fields.js";
import { Lock, resolveIconProps } from "../primitives/icons.js";

export interface LockscreenModalProps
  extends Omit<
    DialogContentProps,
    | "children"
    | "size"
    | "showCloseButton"
    | "aria-describedby"
    | "onPointerDownOutside"
    | "onEscapeKeyDown"
  > {
  open: boolean;
  /** Whole seconds left on the server-driven lockout. Submit is blocked above 0. */
  lockedSecondsRemaining?: number | undefined;
  /** Server rejection text (wrong passcode, breached list). Shown on the field. */
  error?: string | undefined;
  /** Remaining attempts before lockout, when the server reports it. */
  attemptsRemaining?: number | undefined;
  onUnlock?: ((passcode: string) => void) | undefined;
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
  React.ElementRef<typeof DialogContent>,
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

    // Drop any typed passcode as soon as the lockscreen closes, so a reopened
    // lockscreen never prefills the previous attempt.
    React.useEffect(() => {
      if (!open) {
        setPasscode("");
      }
    }, [open]);

    return (
      // Non-dismissable by design: only the parent clears `open` after a
      // successful unlock, so Escape and outside pointer downs cannot bypass it.
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={ref}
          size="sm"
          aria-describedby={undefined}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
          }}
          {...props}
        >
          <DialogHeader className="grid justify-center justify-items-center gap-[var(--nb-space-2)] text-center">
            <span className="grid h-[var(--nb-size-tile-icon)] w-[var(--nb-size-tile-icon)] place-items-center rounded-[var(--nb-radius-menu)] bg-[var(--nb-well)] text-[var(--nb-ink-2)]">
              <Lock {...resolveIconProps({ size: "md" })} />
            </span>
            <DialogTitle>Unlock Notebench</DialogTitle>
            <p className="text-xs text-[var(--nb-ink-2)]">
              Enter your passcode to continue.
            </p>
          </DialogHeader>
          <DialogBody className="gap-[var(--nb-space-4)]">
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
              <Button
                type="submit"
                variant="nb_btn_primary"
                disabled={locked}
                className="w-full"
              >
                Unlock
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }
);
LockscreenModal.displayName = "LockscreenModal";

export { LockscreenModal };
