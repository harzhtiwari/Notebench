import * as React from "react";
import { Textarea } from "../primitives/index.js";
import { cn } from "../../lib/utils.js";

export interface EditorShellProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  onDraftSave?: ((draft: string) => void) | undefined;
  draftDebounceMs?: number | undefined;
  header?: React.ReactNode | undefined;
  footer?: React.ReactNode | undefined;
}

/**
Text editing shell with smooth typing and 300 ms debounced draft store (ticket 16).
Maintains immediate local state for zero-latency keystroke responsiveness
while debouncing draft persistence callbacks.
*/
const EditorShell = React.forwardRef<HTMLTextAreaElement, EditorShellProps>(
  (
    {
      className,
      value: controlledValue,
      defaultValue = "",
      onChange,
      onDraftSave,
      draftDebounceMs = 300,
      header,
      footer,
      children,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [localValue, setLocalValue] = React.useState<string>(
      controlledValue ?? defaultValue
    );
    const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestValueRef = React.useRef<string>(localValue);
    latestValueRef.current = localValue;

    // Synchronize if controlled value changes externally
    React.useEffect(() => {
      if (controlledValue !== undefined && controlledValue !== latestValueRef.current) {
        setLocalValue(controlledValue);
      }
    }, [controlledValue]);

    // Clean up timer on unmount
    React.useEffect(() => {
      return () => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setLocalValue(next);
      onChange?.(next);

      if (!onDraftSave) {
        return;
      }

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onDraftSave(next);
        debounceTimerRef.current = null;
      }, draftDebounceMs);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // Flush pending draft save on blur
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        onDraftSave?.(latestValueRef.current);
      }
      onBlur?.(e);
    };

    return (
      <div
        className={cn(
          "editor-shell relative flex flex-col gap-[var(--nb-space-2)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-3)] text-[var(--nb-ink)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none focus-within:outline-solid focus-within:outline-[length:var(--nb-ring-width)] focus-within:outline-[var(--nb-focus)] focus-within:outline-offset-[var(--nb-ring-offset)]",
          className
        )}
      >
        {header === undefined ? null : <div className="editor-shell-header">{header}</div>}
        {children ?? (
          <Textarea
            ref={ref}
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            className="min-h-[var(--nb-size-textarea-min)] w-full resize-y border-0 bg-transparent p-0 font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-md)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)] placeholder:text-[var(--nb-ink-3)] focus:outline-none focus-visible:outline-none focus-visible:outline-0 focus-visible:outline-offset-0"
            {...props}
          />
        )}
        {footer === undefined ? null : <div className="editor-shell-footer">{footer}</div>}
      </div>
    );
  }
);
EditorShell.displayName = "EditorShell";

export { EditorShell };
