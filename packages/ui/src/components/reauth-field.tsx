import * as React from "react";
import { FormField } from "./form-field.js";
import { Input } from "./input.js";
import { PasswordInput } from "./password-input.js";

export type ReauthMode = "passcode" | "phrase";

export interface ReauthFieldProps {
  /** Mode: "passcode" uses PasswordInput; "phrase" uses text Input with expected phrase match. */
  mode?: ReauthMode | undefined;
  /** Current value of the input. */
  value: string;
  /** Change callback. */
  onChange: (value: string) => void;
  /** Required phrase to type in "phrase" mode (e.g. "DELETE" or notebook title). */
  expectedPhrase?: string | undefined;
  /** Custom label. If omitted, a descriptive default is used based on mode and expectedPhrase. */
  label?: string | undefined;
  /** Error message. */
  error?: string | undefined;
  /** Hint text. */
  hint?: string | undefined;
  /** Disabled state. */
  disabled?: boolean | undefined;
  /** Optional placeholder override. */
  placeholder?: string | undefined;
  /** HTML id. */
  id?: string | undefined;
  /** Additional wrapper class names (using var(--nb-*) only). */
  className?: string | undefined;
  /** AutoFocus attribute. */
  autoFocus?: boolean | undefined;
}

/**
 * ReauthField (ticket 20): Reusable re-authentication field required for high-risk
 * deletion actions. Supports both owner passcode entry and typed phrase confirmation
 * ("DELETE" / notebook title). Composes FormField with PasswordInput or Input.
 */
const ReauthField = React.forwardRef<HTMLInputElement, ReauthFieldProps>(
  (
    {
      mode = "passcode",
      value,
      onChange,
      expectedPhrase = "DELETE",
      label,
      error,
      hint,
      disabled = false,
      placeholder,
      id,
      className,
      autoFocus = false,
    },
    ref
  ) => {
    const inputId = id ?? (mode === "passcode" ? "reauth-passcode" : "reauth-phrase");
    const isPhrase = mode === "phrase";

    const defaultLabel = isPhrase
      ? `Type "${expectedPhrase}" to confirm`
      : "Enter owner passcode";

    const defaultPlaceholder = isPhrase
      ? `Type "${expectedPhrase}" to confirm`
      : undefined;

    return (
      <FormField
        className={className}
        label={label ?? defaultLabel}
        error={error}
        hint={hint}
      >
        {isPhrase ? (
          <Input
            ref={ref}
            id={inputId}
            type="text"
            value={value}
            disabled={disabled}
            placeholder={placeholder ?? defaultPlaceholder}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        ) : (
          <PasswordInput
            ref={ref}
            id={inputId}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="current-password"
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        )}
      </FormField>
    );
  }
);
ReauthField.displayName = "ReauthField";

export { ReauthField };
