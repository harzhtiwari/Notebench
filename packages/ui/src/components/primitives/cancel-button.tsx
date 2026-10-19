import * as React from "react";
import {
  Button,
  type ButtonVariant,
  type StandardButtonProps,
} from "./button.js";
import { XCircleIcon } from "./icons.js";

export interface CancelButtonProps
  extends Omit<StandardButtonProps, "children" | "variant" | "size"> {
  /**
  Optional AbortController whose abort() will be called on click.
  */
  controller?: AbortController | undefined;
  /**
  Optional AbortSignal to track external cancellation.
  */
  signal?: AbortSignal | undefined;
  /**
  Callback fired when cancellation is triggered.
  */
  onCancel?: (() => void) | undefined;
  /**
  Custom label when idle/running. Defaults to "Cancel".
  */
  label?: string | undefined;
  /**
  Custom label when aborted/cancelled. Defaults to "Cancelled".
  */
  cancelledLabel?: string | undefined;
  /**
  Button style variant. Defaults to canonical "nb_btn_secondary".
  */
  variant?: ButtonVariant | undefined;
  /**
  Button height/padding size. Defaults to "nb_btn_sm".
  */
  size?: "nb_btn_sm" | "nb_btn_md" | "nb_btn_lg" | undefined;
  children?: React.ReactNode | undefined;
}

/**
Reusable cancellation button for streaming generation/jobs (Ticket 13).
Integrates with AbortController / AbortSignal, disables on abort, and maintains
accessible icon + label pairs (never color-alone). Composes the canonical
Button (`nb_btn_secondary` / `nb_btn_sm`; board `.btn`) and routes the icon
through the `leadingIcon` channel so the board icon canon applies
(`--nb-size-icon-sm`, bold at the small size).
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
      variant = "nb_btn_secondary",
      size = "nb_btn_sm",
      label = "Cancel",
      cancelledLabel = "Cancelled",
      children,
      "aria-label": ariaLabel,
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
      const onAbort = () => { setIsAborted(true); };
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

    const displayText = isAborted ? cancelledLabel : (children ?? label);
    const resolvedAriaLabel =
      ariaLabel ?? (isAborted ? "Generation cancelled" : "Cancel generation");

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        leadingIcon={XCircleIcon}
        disabled={disabled || isAborted}
        onClick={handleClick}
        className={className}
        aria-label={resolvedAriaLabel}
        {...props}
      >
        {displayText}
      </Button>
    );
  }
);
CancelButton.displayName = "CancelButton";

export { CancelButton };
