import * as React from "react";
import { IconButton } from "./button.js";
import {
  CheckSquare,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Square,
  WarningCircle,
} from "./icons.js";
import { cn } from "../../lib/utils.js";

/**
 * All form controls in one file (the board's fields section):
 * Input, Textarea, FormField, PasswordInput, SearchInput, Checkbox,
 * CheckboxRow and SegmentedControl. Every value binds to the four token
 * pillars (color, type, space/shape, motion); no literals live here.
 */

/** Board `.input` choreography shared by Input and Textarea. */
const fieldBase = [
  "w-full rounded-[var(--nb-radius-input)] border border-[var(--nb-edge)] bg-[var(--nb-well)]",
  "px-[var(--nb-space-3)] text-sm text-[var(--nb-ink)]",
  "transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none",
  "placeholder:text-[var(--nb-ink-3)]",
  "focus-visible:outline-solid focus-visible:outline-[length:var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
  "aria-invalid:border-[var(--nb-danger)] aria-invalid:shadow-[inset_0_0_0_var(--nb-border-1)_var(--nb-danger)]",
  "disabled:cursor-not-allowed disabled:border-[var(--nb-hairline)] disabled:bg-[var(--nb-disabled-bg)] disabled:text-[var(--nb-disabled-fg)]",
].join(" ");

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex min-h-[var(--nb-size-control-md)] py-[var(--nb-space-1)] file:border-0 file:bg-transparent file:text-sm file:font-medium",
        fieldBase,
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "block min-h-[var(--nb-size-textarea-min)] resize-y py-[var(--nb-space-2)]",
        fieldBase,
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible label text. Linked to the child input via its `id`. */
  label: string;
  /** Error text. Renders the board `.err` row and marks the child invalid. */
  error?: string | undefined;
  /** Helper text shown only when there is no error (board `.help`). */
  hint?: string | undefined;
  /** Optional metadata chip in mono, rendered opposite the label. */
  meta?: string | undefined;
}

/**
 * Label + control + error pattern (board `.field` / `.err`).
 * The label, `aria-invalid`, and `aria-describedby` are wired from the child
 * control's `id` (matching board demo `f2`/`f2e`); a fallback id is generated
 * when the child carries none.
 */
const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, error, hint, meta, children, ...props }, ref) => {
    const child = React.Children.only(children);
    const childId = React.isValidElement<{ id?: string }>(child)
      ? (child.props.id ?? undefined)
      : undefined;
    // Board links label/input/error through the input id; fall back to a
    // generated one so the label is never left unlinked.
    const generatedId = React.useId();
    const inputId = childId ?? generatedId;
    const errorId = `${inputId}-error`;
    const hasError = error !== undefined && error !== "";

    const control =
      React.isValidElement<Record<string, unknown>>(child) && hasError
        ? React.cloneElement(child, {
            id: inputId,
            "aria-invalid": true,
            "aria-describedby": errorId,
          } as Record<string, unknown>)
        : child;

    return (
      <div
        ref={ref}
        className={cn("grid min-w-0 gap-[var(--nb-space-1)]", className)}
        {...props}
      >
        <span className="flex items-baseline justify-between gap-[var(--nb-space-2)]">
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-[var(--nb-ink)]"
          >
            {label}
          </label>
          {meta !== undefined ? (
            <span className="rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] font-mono text-[length:var(--nb-text-2xs)] text-[var(--nb-ink-3)]">
              {meta}
            </span>
          ) : null}
        </span>
        {control}
        {hint !== undefined && !hasError ? (
          <p className="text-xs text-[var(--nb-ink-3)]">{hint}</p>
        ) : null}
        {hasError ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-[var(--nb-space-2)] text-xs font-semibold text-[var(--nb-danger)]"
          >
            <WarningCircle
              size={16}
              weight="fill"
              aria-hidden="true"
              className="shrink-0"
            />
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
FormField.displayName = "FormField";

export type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Password input with a show/hide toggle. Composes `Input` with a ghost
 * `IconButton` so the toggle inherits the token-only focus ring. Icons come
 * from the catalog (`Eye` / `EyeSlash`).
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <IconButton
          type="button"
          variant="nb_btn_ghost"
          size="nb_btn_icon_sm"
          icon={visible ? Eye : EyeSlash}
          active={visible}
          aria-label={visible ? "Hide passcode" : "Show passcode"}
          onClick={() => {
            setVisible((v) => !v);
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--nb-ink-2)]"
        />
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export type SearchInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * Search field in the board `.search` shape: bold 16px icon + borderless
 * input on a well wash pill. Always needs an accessible label from the caller.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex min-h-[var(--nb-size-control-md)] items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] border border-[var(--nb-edge)] bg-[var(--nb-well)] px-[var(--nb-space-4)] text-[var(--nb-ink-3)]",
        "focus-within:outline-solid focus-within:outline-[length:var(--nb-ring-width)] focus-within:outline-[var(--nb-focus)] focus-within:outline-offset-[var(--nb-ring-offset)]",
        className
      )}
    >
      <MagnifyingGlass
        size={16}
        weight="bold"
        aria-hidden="true"
        className="shrink-0"
      />
      <input
        ref={ref}
        type="search"
        className="min-h-[var(--nb-size-control-md)] w-full min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--nb-ink)] placeholder:text-[var(--nb-ink-3)] focus-visible:outline-none"
        {...props}
      />
    </div>
  )
);
SearchInput.displayName = "SearchInput";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  children?: React.ReactNode | undefined;
}

/**
 * Board `.check`: a native checkbox next to its label, 24px square with the
 * ink accent, on the control-md touch target. The label carries the meaning;
 * the input stays native for platform behaviour and assistive tech.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, children, ...props }, ref) => (
    <label
      className={cn(
        "inline-flex min-h-[var(--nb-size-control-md)] cursor-pointer items-center gap-[var(--nb-space-3)] text-sm text-[var(--nb-ink)]",
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="m-0 h-[var(--nb-size-icon-lg)] w-[var(--nb-size-icon-lg)] shrink-0 accent-[var(--nb-ink)]"
        {...props}
      />
      {children !== undefined ? <span>{children}</span> : null}
    </label>
  )
);
Checkbox.displayName = "Checkbox";

export interface CheckboxRowProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "role" | "onChange" | "aria-checked"
  > {
  /** Checked state drives the Square/CheckSquare swap. */
  checked: boolean;
  onChange?: ((checked: boolean) => void) | undefined;
}

/**
 * Selection checkbox row (ticket 09): icon + label always, never icon-alone.
 * Deviates from the board `.check` native input on purpose — the ticket names
 * `CheckSquare`/`Square` as the selection affordance, so the checked state
 * swaps the glyph while the visible label carries the meaning. Parent owns
 * scope (only checked Sources ground chat); this owns nothing but the toggle.
 * Retained in the consolidation for backward compatibility.
 */
const CheckboxRow = React.forwardRef<HTMLButtonElement, CheckboxRowProps>(
  ({ className, checked, onChange, disabled, children, ...props }, ref) => {
    const Icon = checked ? CheckSquare : Square;
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          onChange?.(!checked);
        }}
        className={cn(
          "group inline-flex min-h-[var(--nb-size-control-md)] cursor-pointer items-center gap-[var(--nb-space-3)] text-left text-sm text-[var(--nb-ink)] disabled:cursor-not-allowed disabled:text-[var(--nb-disabled-fg)]",
          className
        )}
        {...props}
      >
        <Icon
          size={20}
          aria-hidden="true"
          className="shrink-0 text-[var(--nb-ink-2)] group-disabled:text-[var(--nb-disabled-fg)]"
        />
        <span>{children}</span>
      </button>
    );
  }
);
CheckboxRow.displayName = "CheckboxRow";

export interface SegmentedControlOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean | undefined;
}

export interface SegmentedControlProps
  extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange"> {
  options: readonly SegmentedControlOption[];
  /** Currently selected option value. */
  value: string;
  /** Selection callback. */
  onChange: (value: string) => void;
  /** Radio group name. Generated when omitted. */
  name?: string | undefined;
}

/**
 * Board `.seg`: pill container on a well wash holding native radio inputs.
 * The checked option flips to an ink fill with inverse text (via the
 * `peer-checked` state), so selection is never color-alone.
 */
const SegmentedControl = React.forwardRef<
  HTMLFieldSetElement,
  SegmentedControlProps
>(
  ({ className, options, value, onChange, name, ...props }, ref) => {
    const generatedName = React.useId();
    return (
      <fieldset
        ref={ref}
        className={cn(
          "inline-flex rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-0-5)]",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name ?? generatedName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => {
                onChange(option.value);
              }}
              className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <span className="inline-flex min-h-[var(--nb-size-control-sm)] items-center gap-[var(--nb-space-2)] rounded-[var(--nb-radius-chip)] px-[var(--nb-space-4)] text-xs font-semibold text-[var(--nb-ink-2)] peer-checked:bg-[var(--nb-ink)] peer-checked:text-[var(--nb-ink-inv)] peer-focus-visible:outline-solid peer-focus-visible:outline-[length:var(--nb-ring-width)] peer-focus-visible:outline-[var(--nb-focus)] peer-focus-visible:outline-offset-[var(--nb-ring-offset)]">
              {option.label}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
);
SegmentedControl.displayName = "SegmentedControl";

export {
  Checkbox,
  CheckboxRow,
  FormField,
  Input,
  PasswordInput,
  SearchInput,
  SegmentedControl,
  Textarea,
};
