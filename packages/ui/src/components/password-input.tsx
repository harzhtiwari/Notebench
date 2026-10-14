import * as React from "react";
import { Button } from "./button.js";
import { Eye, EyeSlash } from "./icons.js";
import { Input } from "./input.js";
import { cn } from "../lib/utils.js";

export type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Password input with a show/hide toggle. shadcn-style wrapper over `Input`;
 * the toggle is a ghost icon `Button` so it inherits the token-only focus
 * ring. Icons come from the catalog (`Eye` / `EyeSlash`).
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={visible ? "Hide passcode" : "Show passcode"}
          aria-pressed={visible}
          onClick={() => {
            setVisible((v) => !v);
          }}
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-[var(--nb-ink-2)]"
        >
          {visible ? (
            <Eye size={16} aria-hidden="true" />
          ) : (
            <EyeSlash size={16} aria-hidden="true" />
          )}
        </Button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
