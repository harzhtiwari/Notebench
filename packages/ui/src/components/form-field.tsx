import * as React from "react";
import { WarningCircle } from "./icons.js";
import { cn } from "../lib/utils.js";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible label text. Linked to the child input via its `id`. */
  label: string;
  /** Error text. Renders the board `.err` row and marks the child invalid. */
  error?: string | undefined;
  /** Helper text shown only when there is no error (board `.help`). */
  hint?: string | undefined;
}

/**
 * Label + control + error pattern (board `.field` / `.err`).
 * The label, `aria-invalid`, and `aria-describedby` are wired from the child
 * control's `id` (matching board demo `f2`/`f2e`); a fallback id is generated
 * when the child carries none.
 */
const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, error, hint, children, ...props }, ref) => {
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
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-[var(--nb-ink)]"
        >
          {label}
        </label>
        {control}
        {hint !== undefined && !hasError ? (
          <p className="text-[11px] text-[var(--nb-ink-2)]">{hint}</p>
        ) : null}
        {hasError ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-[var(--nb-space-2)] text-xs font-semibold text-[var(--nb-danger)]"
          >
            <WarningCircle size={16} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
FormField.displayName = "FormField";

export { FormField };
