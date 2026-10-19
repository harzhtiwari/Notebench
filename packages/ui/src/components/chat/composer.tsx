import * as React from "react";
import { IconButton } from "../primitives/button.js";
import { Input } from "../primitives/fields.js";
import { PaperPlaneRightIcon } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface ComposerProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "onChange" | "onKeyDown" | "onSubmit" | "children"
  > {
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

export type ComposerRowProps = React.HTMLAttributes<HTMLDivElement>;

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

export type ComposerInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const ComposerInput = React.forwardRef<HTMLInputElement, ComposerInputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      className={cn(
        "composer-input flex-1 min-w-[var(--nb-size-composer-min)] rounded-none border-0 bg-transparent px-0 py-0 font-[family-name:var(--nb-font-ui)] text-[length:var(--nb-text-md)] text-[var(--nb-ink)] placeholder:text-[var(--nb-ink-3)] placeholder:opacity-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--nb-disabled-fg)]",
        className
      )}
      {...props}
    />
  )
);
ComposerInput.displayName = "ComposerInput";

/**
Board `.composer` pattern (board.test.html:541-546).
Grounded chat input with send button, Enter-to-submit, and secondary slot.
*/
export const Composer = React.forwardRef<HTMLDivElement, ComposerProps>(
  (
    {
      value,
      defaultValue = "",
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
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const currentValue = isControlled ? value : internalValue;
    const { onChange: inputOnChange, ...restInputProps } = inputProps ?? {};

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
      inputOnChange?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
        return;
      }

      e.preventDefault();
      handleSend();
    };

    const secondaryContent = footer ?? children;

    return (
      <div
        ref={ref}
        className={cn(
          "composer grid gap-[var(--nb-space-2)] bg-[var(--nb-sheet)] border border-[var(--nb-edge)] rounded-[var(--nb-radius-composer)] p-[var(--nb-space-3)] pl-[var(--nb-space-5)] shadow-[var(--nb-shadow-float)] focus-within:outline-solid focus-within:outline-[length:var(--nb-ring-width)] focus-within:outline-[var(--nb-focus)] focus-within:outline-offset-[var(--nb-ring-offset)]",
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
            {...restInputProps}
          />
          <IconButton
            type="button"
            variant="nb_btn_primary"
            size="nb_btn_icon_md"
            aria-label={sendAriaLabel}
            disabled={!canSend}
            onClick={handleSend}
            icon={PaperPlaneRightIcon}
          />
        </ComposerRow>
        {secondaryContent ? <ComposerRow>{secondaryContent}</ComposerRow> : null}
      </div>
    );
  }
);
Composer.displayName = "Composer";
