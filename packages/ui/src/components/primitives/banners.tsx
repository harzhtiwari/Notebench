import * as React from "react";

import { Button, IconButton } from "./button.js";
import { CheckCircle, Info, Warning, WarningCircle, X } from "./icons.js";
import { cn } from "../../lib/utils.js";

export type BannerTone = "info" | "warn" | "error" | "ok" | "neutral";

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Visual status tone. Governs wash background, border, and default icon. */
  tone?: BannerTone | undefined;
  /** Primary headline. Rendered in semibold text with tone color. */
  title?: React.ReactNode;
  /** Descriptive body copy. */
  message?: React.ReactNode;
  /** Optional custom lead icon. When omitted, the canonical tone icon is used. */
  icon?: React.ReactNode;
  /** Optional single primary action label. */
  actionLabel?: string | undefined;
  /** Callback fired when primary action is clicked. */
  onAction?: (() => void) | undefined;
  /** Optional secondary action label. */
  secondaryActionLabel?: string | undefined;
  /** Callback fired when secondary action is clicked. */
  onSecondaryAction?: (() => void) | undefined;
  /** Callback fired when dismiss button is clicked. When provided, renders close icon. */
  onDismiss?: (() => void) | undefined;
  /** Accessible dismiss button label. Defaults to "Dismiss". */
  dismissLabel?: string | undefined;
  /** Compact density variant for inline form validation. Defaults to false. */
  compact?: boolean | undefined;
}

export interface BannerIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BannerTone | undefined;
  children?: React.ReactNode;
}

export interface BannerBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface BannerTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  tone?: BannerTone | undefined;
  compact?: boolean | undefined;
  children: React.ReactNode;
}

export interface BannerDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  compact?: boolean | undefined;
  children: React.ReactNode;
}

export interface BannerActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Board `.banner--*` wash + border pair per tone (board.test.html#L581-589). */
const TONE_STYLES: Record<BannerTone, string> = {
  error: "banner--error border-[var(--nb-danger)] bg-[var(--nb-danger-wash)]",
  warn: "banner--warn border-[var(--nb-warn)] bg-[var(--nb-warn-wash)]",
  info: "banner--info border-[var(--nb-link)] bg-[var(--nb-link-wash)]",
  ok: "banner--ok border-[var(--nb-ok)] bg-[var(--nb-ok-wash)]",
  neutral: "banner--neutral border-[var(--nb-hairline)] bg-[var(--nb-well)]",
};

const TONE_TEXT: Record<BannerTone, string> = {
  error: "text-[var(--nb-danger)]",
  warn: "text-[var(--nb-warn)]",
  info: "text-[var(--nb-link)]",
  ok: "text-[var(--nb-ok)]",
  neutral: "text-[var(--nb-ink)]",
};

/** Lead icon color: the tone color, or ink-2 for neutral (board `.lead` rules). */
const TONE_LEAD_TEXT: Record<BannerTone, string> = {
  error: "text-[var(--nb-danger)]",
  warn: "text-[var(--nb-warn)]",
  info: "text-[var(--nb-link)]",
  ok: "text-[var(--nb-ok)]",
  neutral: "text-[var(--nb-ink-2)]",
};

/**
 * Canonical tone icon so status is never communicated by color alone
 * (board.test.html#L1131). Phosphor fill at the 20px read size.
 */
function toneIcon(tone: BannerTone): React.ReactElement {
  const className = cn("shrink-0", TONE_LEAD_TEXT[tone]);

  switch (tone) {
    case "error":
      return (
        <WarningCircle size={20} weight="fill" aria-hidden="true" className={className} />
      );
    case "warn":
      return <Warning size={20} weight="fill" aria-hidden="true" className={className} />;
    case "ok":
      return <CheckCircle size={20} weight="fill" aria-hidden="true" className={className} />;
    case "neutral":
      return <Info size={20} weight="fill" aria-hidden="true" className={className} />;
    case "info":
    default:
      return <Info size={20} weight="fill" aria-hidden="true" className={className} />;
  }
}

export const BannerIcon = React.forwardRef<HTMLSpanElement, BannerIconProps>(
  ({ tone, className, children, ...props }, ref) => (
    <span ref={ref} className={cn("shrink-0", className)} {...props}>
      {children ?? (tone !== undefined ? toneIcon(tone) : null)}
    </span>
  )
);
BannerIcon.displayName = "BannerIcon";

export const BannerBody = React.forwardRef<HTMLDivElement, BannerBodyProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("grid min-w-0 gap-[var(--nb-space-2)]", className)}
      {...props}
    >
      {children}
    </div>
  )
);
BannerBody.displayName = "BannerBody";

export const BannerTitle = React.forwardRef<HTMLHeadingElement, BannerTitleProps>(
  ({ tone = "info", compact = false, className, children, ...props }, ref) => (
    <h4
      ref={ref}
      className={cn(
        "font-semibold",
        compact
          ? "text-[length:var(--nb-text-xs)]"
          : "text-[length:var(--nb-text-sm)]",
        TONE_TEXT[tone],
        className
      )}
      {...props}
    >
      {children}
    </h4>
  )
);
BannerTitle.displayName = "BannerTitle";

export const BannerDescription = React.forwardRef<
  HTMLParagraphElement,
  BannerDescriptionProps
>(({ compact = false, className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-[var(--nb-ink)] leading-[var(--nb-leading-ui)]",
      compact ? "text-[length:var(--nb-text-xs)]" : "text-[length:var(--nb-text-sm)]",
      className
    )}
    {...props}
  >
    {children}
  </p>
));
BannerDescription.displayName = "BannerDescription";

export const BannerActions = React.forwardRef<HTMLDivElement, BannerActionsProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mt-[var(--nb-space-1)] flex flex-wrap items-center gap-[var(--nb-space-2)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
BannerActions.displayName = "BannerActions";

/**
 * Unified banner primitive (board `.banner`, board.test.html#L581-589).
 * error/warn default to `role="alert"`; info/ok/neutral default to `role="status"`.
 */
export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      tone = "info",
      title,
      message,
      icon,
      actionLabel,
      onAction,
      secondaryActionLabel,
      onSecondaryAction,
      onDismiss,
      dismissLabel = "Dismiss",
      compact = false,
      role,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const resolvedRole = role ?? (tone === "error" || tone === "warn" ? "alert" : "status");
    const resolvedLive = resolvedRole === "alert" ? "assertive" : "polite";
    const hasPrimaryAction = actionLabel !== undefined && onAction !== undefined;
    const hasSecondaryAction =
      secondaryActionLabel !== undefined && onSecondaryAction !== undefined;

    return (
      <div
        ref={ref}
        role={resolvedRole}
        aria-live={resolvedLive}
        className={cn(
          "banner grid rounded-[var(--nb-radius-card)] border-[length:var(--nb-border-1)] text-[var(--nb-ink)]",
          compact
            ? "grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-2)] p-[var(--nb-space-3)] text-[length:var(--nb-text-xs)]"
            : "grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] p-[var(--nb-space-4)] max-w-[var(--nb-layout-chat-max)]",
          onDismiss !== undefined ? "grid-cols-[auto_minmax(0,1fr)_auto]" : null,
          TONE_STYLES[tone],
          className
        )}
        {...props}
      >
        {icon !== undefined ? <BannerIcon>{icon}</BannerIcon> : <BannerIcon tone={tone} />}
        <BannerBody>
          {title !== undefined ? (
            <BannerTitle tone={tone} compact={compact}>
              {title}
            </BannerTitle>
          ) : null}
          {message !== undefined ? (
            <BannerDescription compact={compact}>{message}</BannerDescription>
          ) : null}
          {hasPrimaryAction || hasSecondaryAction ? (
            <BannerActions>
              {hasPrimaryAction ? (
                <Button
                  variant="nb_btn_secondary"
                  size="nb_btn_sm"
                  onClick={onAction}
                  type="button"
                >
                  {actionLabel}
                </Button>
              ) : null}
              {hasSecondaryAction ? (
                <Button
                  variant="nb_btn_ghost"
                  size="nb_btn_sm"
                  onClick={onSecondaryAction}
                  type="button"
                >
                  {secondaryActionLabel}
                </Button>
              ) : null}
            </BannerActions>
          ) : null}
          {children}
        </BannerBody>
        {onDismiss !== undefined ? (
          <IconButton
            variant="nb_btn_ghost"
            size="nb_btn_icon_sm"
            icon={X}
            aria-label={dismissLabel}
            onClick={onDismiss}
            className="shrink-0"
          />
        ) : null}
      </div>
    );
  }
);
Banner.displayName = "Banner";

export interface FormBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: React.ReactNode;
  children?: React.ReactNode;
}

/** Compact error banner for inline form validation. */
export const FormError = React.forwardRef<HTMLDivElement, FormBannerProps>(
  ({ message, children, className, ...props }, ref) => (
    <Banner
      ref={ref}
      tone="error"
      compact
      role="alert"
      message={message ?? children}
      className={className}
      {...props}
    />
  )
);
FormError.displayName = "FormError";

/** Compact success banner for inline form validation. */
export const FormSuccess = React.forwardRef<HTMLDivElement, FormBannerProps>(
  ({ message, children, className, ...props }, ref) => (
    <Banner
      ref={ref}
      tone="ok"
      compact
      role="status"
      message={message ?? children}
      className={className}
      {...props}
    />
  )
);
FormSuccess.displayName = "FormSuccess";

export interface AlertBannerProps extends Omit<BannerProps, "tone"> {
  tone?: "warn" | "error" | "info" | undefined;
}

/**
 * Backward-compatible alias for the former alert-banner primitive.
 * Keeps the warn default, the "Exposure alert" default title, and `role="alert"`.
 */
export const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  ({ tone = "warn", title = "Exposure alert", role = "alert", ...props }, ref) => (
    <Banner ref={ref} tone={tone} title={title} role={role} {...props} />
  )
);
AlertBanner.displayName = "AlertBanner";
