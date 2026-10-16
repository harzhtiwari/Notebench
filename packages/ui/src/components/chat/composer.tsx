import * as React from "react";
import { Button } from "../primitives/button.js";
import { PaperPlaneRight } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface ComposerProps {
  value?: string | undefined;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  allowEmpty?: boolean | undefined;
  onSend?: ((value: string) => void) | undefined;
  onSubmit?: ((value: string) => void) | undefined;
  onChange?: ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  onKeyDown?: ((e: React.KeyboardEvent<HTMLInputElement>) => void) | undefined;
  inputRef?: React.Ref<HTMLInputElement> | undefined;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> | undefined;
  sendAriaLabel?: string | undefined;
  className?: string | undefined;
  children?: React.ReactNode | undefined;
  footer?: React.ReactNode | undefined;
}

export interface ComposerRowProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ComposerRow = React.forwardRef<HTMLDivElement, ComposerRowProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("composer-row flex items-center gap-[var(--nb-space-2)] flex-wrap", className)}
      {...props}
    />
  )
);
ComposerRow.displayName = "ComposerRow";

export interface ComposerInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const ComposerInput = React.forwardRef<HTMLInputElement, ComposerInputProps>(
  ({ className, disabled, ...props }, ref) => (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(
        "composer-input flex-1 min-w-[var(--nb-size-composer-min)] bg-transparent border-0 text-[var(--nb-ink)] font-inherit text-[length:var(--nb-text-md)] min-h-[var(--nb-size-control-md)] placeholder:text-[var(--nb-ink-3)] placeholder:opacity-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-[var(--nb-disabled-fg)]",
        className
      )}
      {...props}
    />
  )
);
ComposerInput.displayName = "ComposerInput";

/**
 * Board `.composer` pattern (docs/ui/board.test.html:541-546).
 * Grounded chat input with send button, Enter-to-submit, and secondary slot.
 */
export const Composer = React.forwardRef<HTMLDivElement, ComposerProps>(
  (
    {
      value,
      defaultValue,
      placeholder = "Ask a question or create something",
      disabled = false,
      allowEmpty = false,
      onSend,
      onSubmit,
      onChange,
      onValueChange,
      onKeyDown,
      inputRef,
      inputProps,
      sendAriaLabel = "Send",
      className,
      children,
      footer,
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
    const currentValue = isControlled ? value : internalValue;

    const trimmed = currentValue.trim();
    const canSend = !disabled && (allowEmpty || trimmed.length > 0);

    const handleSend = () => {
      if (!canSend) return;
      onSend?.(trimmed);
      onSubmit?.(trimmed);
      if (!isControlled) {
        setInternalValue("");
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter" && !e.shiftKey) {
        if (!e.nativeEvent.isComposing) {
          e.preventDefault();
          handleSend();
        }
      }
    };

    const secondaryContent = footer ?? children;

    return (
      <div
        ref={ref}
        className={cn(
          "composer grid gap-[var(--nb-space-2)] bg-[var(--nb-sheet)] border border-[var(--nb-edge)] rounded-[var(--nb-radius-composer)] p-[var(--nb-space-3)] pl-[var(--nb-space-5)] shadow-[var(--nb-shadow-float)] focus-within:outline focus-within:outline-[length:var(--nb-ring-width)] focus-within:outline-[var(--nb-focus)] focus-within:outline-offset-[var(--nb-ring-offset)]",
          disabled && "opacity-60",
          className
        )}
        {...props}
      >
        <ComposerRow>
          <ComposerInput
            ref={inputRef}
            aria-label={placeholder}
            placeholder={placeholder}
            value={currentValue}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            {...inputProps}
          />
          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label={sendAriaLabel}
            disabled={!canSend}
            onClick={handleSend}
          >
            <PaperPlaneRight size={16} weight="bold" />
          </Button>
        </ComposerRow>
        {secondaryContent ? <ComposerRow>{secondaryContent}</ComposerRow> : null}
      </div>
    );
  }
);
Composer.displayName = "Composer";
