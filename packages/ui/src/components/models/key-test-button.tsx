import * as React from "react";
import { Button } from "../primitives/button.js";
import { CheckCircle, Key, WarningCircle } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export type KeyTestState = "idle" | "testing" | "ok" | "fail";

export interface KeyTestButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "disabled"
  > {
  state: KeyTestState;
  /** Round-trip milliseconds, shown on success when the server reports it. */
  latencyMs?: number | undefined;
  /**
   * Server-sanitised failure text. The key must never appear here — scrubbing
   * is the server's job; this component renders the string verbatim.
   */
  message?: string | undefined;
  onTest?: (() => void) | undefined;
}

/**
 * Key-test action with four states. Icon + label always (state is never
 * color-alone). Clicks re-run the test in every state except `testing`.
 */
const KeyTestButton = React.forwardRef<HTMLButtonElement, KeyTestButtonProps>(
  ({ className, state, latencyMs, message, onTest, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      disabled={state === "testing"}
      onClick={() => {
        if (state !== "testing") {
          onTest?.();
        }
      }}
      className={cn("gap-[var(--nb-space-2)]", className)}
      {...props}
    >
      {state === "idle" ? (
        <>
          <Key size={16} aria-hidden="true" />
          Test Key
        </>
      ) : state === "testing" ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-[var(--nb-radius-full)] border-2 border-current border-r-transparent motion-safe:animate-spin"
          />
          Testing…
        </>
      ) : state === "ok" ? (
        <>
          <CheckCircle size={16} aria-hidden="true" />
          {latencyMs !== undefined
            ? `Verified Connected (latency: ${latencyMs}ms)`
            : "Verified Connected"}
        </>
      ) : (
        <>
          <WarningCircle size={16} aria-hidden="true" />
          {message ?? "Test failed."}
        </>
      )}
    </Button>
  )
);
KeyTestButton.displayName = "KeyTestButton";

export { KeyTestButton };
