import * as React from "react";
import { Button } from "../primitives/button.js";
import { CheckCircle, Key, WarningCircle } from "../primitives/icons.js";

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
 * The `testing` state uses the primitive's built-in spinner via `loading`.
 */
const KeyTestButton = React.forwardRef<HTMLButtonElement, KeyTestButtonProps>(
  ({ className, state, latencyMs, message, onTest, ...props }, ref) => {
    const LeadingIcon =
      state === "ok" ? CheckCircle : state === "fail" ? WarningCircle : Key;

    return (
      <Button
        ref={ref}
        type="button"
        variant="nb_btn_secondary"
        size="nb_btn_sm"
        loading={state === "testing"}
        loadingLabel="Testing…"
        leadingIcon={LeadingIcon}
        disabled={state === "testing"}
        onClick={() => {
          if (state !== "testing") {
            onTest?.();
          }
        }}
        className={className}
        {...props}
      >
        {state === "ok"
          ? latencyMs !== undefined
            ? `Verified Connected (latency: ${latencyMs}ms)`
            : "Verified Connected"
          : state === "fail"
            ? (message ?? "Test failed.")
            : "Test Key"}
      </Button>
    );
  }
);
KeyTestButton.displayName = "KeyTestButton";

export { KeyTestButton };
