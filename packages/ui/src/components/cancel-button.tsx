import * as React from "react";
import { Button, type ButtonProps } from "./button.js";
import { XCircle } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface CancelButtonProps
  extends Omit<ButtonProps, "children"> {
  /** Optional AbortController whose abort() will be called on click. */
  controller?: AbortController | undefined;
  /** Optional AbortSignal to track external cancellation. */
  signal?: AbortSignal | undefined;
  /** Callback fired when cancellation is triggered. */
  onCancel?: (() => void) | undefined;
  /** Custom label when idle/running. Defaults to "Cancel". */
  label?: string | undefined;
  /** Custom label when aborted/cancelled. Defaults to "Cancelled". */
  cancelledLabel?: string | undefined;
  children?: React.ReactNode | undefined;
}

/**
 * Reusable cancellation button for streaming generation/jobs (Ticket 13).
 * Integrates with AbortController / AbortSignal, disables on abort, and maintains
 * accessible icon + label pairs (never color-alone).
 */
const CancelButton = React.forwardRef<HTMLButtonElement, CancelButtonProps>(
  (
    {
      className,
      controller,
      signal,
      onCancel,
      onClick,
      disabled = false,
      variant = "secondary",
      size = "sm",
      label = "Cancel",
      cancelledLabel = "Cancelled",
      children,
      ...props
    },
    ref
  ) => {
    const effectiveSignal = signal ?? controller?.signal;
    const [isAborted, setIsAborted] = React.useState<boolean>(
      () => Boolean(effectiveSignal?.aborted)
    );

    React.useEffect(() => {
      if (!effectiveSignal) return;
      if (effectiveSignal.aborted) {
        setIsAborted(true);
        return;
      }
      const onAbort = () => setIsAborted(true);
      effectiveSignal.addEventListener("abort", onAbort, { once: true });
      return () => {
        effectiveSignal.removeEventListener("abort", onAbort);
      };
    }, [effectiveSignal]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      setIsAborted(true);
      onCancel?.();
      onClick?.(e);
    };

    const displayText = isAborted
      ? cancelledLabel
      : (children ?? label);

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || isAborted}
        onClick={handleClick}
        aria-label={isAborted ? "Generation cancelled" : "Cancel generation"}
        className={cn("gap-[var(--nb-space-1)]", className)}
        {...props}
      >
        <XCircle size={14} weight="fill" aria-hidden="true" className="shrink-0" />
        <span>{displayText}</span>
      </Button>
    );
  }
);
CancelButton.displayName = "CancelButton";

export { CancelButton };
