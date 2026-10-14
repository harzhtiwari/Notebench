import * as React from "react";
import { cn } from "../lib/utils.js";

export type FormErrorProps = React.HTMLAttributes<HTMLDivElement>;
export type FormSuccessProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * In-form feedback banners. Class shapes mirror the setup page's existing
 * error/success boxes (`apps/web/src/app/setup/page.tsx`), which already use
 * the `danger` / `ok` token roles — no new colors, roles carry the meaning.
 */
const FormError = React.forwardRef<HTMLDivElement, FormErrorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "rounded-[var(--nb-radius-card)] border border-[var(--nb-danger)] bg-[var(--nb-danger-wash)] p-3 text-xs text-[var(--nb-danger)]",
        className
      )}
      {...props}
    />
  )
);
FormError.displayName = "FormError";

const FormSuccess = React.forwardRef<HTMLDivElement, FormSuccessProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        "rounded-[var(--nb-radius-card)] border border-[var(--nb-ok)] bg-[var(--nb-ok-wash)] p-3 text-xs text-[var(--nb-ok)]",
        className
      )}
      {...props}
    />
  )
);
FormSuccess.displayName = "FormSuccess";

export { FormError, FormSuccess };
