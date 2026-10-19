import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "../../lib/utils.js";

import { icon as iconTokens, size as sizeTokens } from "../../tokens.js";

export type ButtonVariant =
  | "nb_btn_primary"
  | "nb_btn_secondary"
  | "nb_btn_ghost"
  | "nb_btn_danger"
  | "nb_btn_link";

export type ButtonSize =
  | "nb_btn_sm"
  | "nb_btn_md"
  | "nb_btn_lg"
  | "nb_btn_icon_sm"
  | "nb_btn_icon_md"
  | "nb_btn_icon_lg";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--nb-radius-control)] border-[length:var(--nb-border-1)] border-transparent font-[number:var(--nb-weight-semibold)] leading-[var(--nb-leading-none)] text-[var(--nb-ink)] cursor-pointer select-none transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-solid focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] disabled:cursor-not-allowed disabled:bg-[var(--nb-disabled-bg)] disabled:text-[var(--nb-disabled-fg)] disabled:border-[var(--nb-hairline)] disabled:shadow-none aria-pressed:bg-[var(--nb-ink)] aria-pressed:text-[var(--nb-ink-inv)] aria-pressed:border-[var(--nb-ink)] font-[family-name:var(--nb-font-ui)]",
  {
    variants: {
      variant: {
        nb_btn_primary:
          "bg-[var(--nb-ink)] text-[var(--nb-ink-inv)] border-transparent hover:bg-[var(--nb-ink-2)] active:bg-[var(--nb-ink-3)]",
        nb_btn_secondary:
          "bg-[var(--nb-sheet)] text-[var(--nb-ink)] border-[var(--nb-edge)] hover:bg-[var(--nb-well-hover)] active:bg-[var(--nb-well)]",
        nb_btn_ghost:
          "bg-transparent text-[var(--nb-ink)] border-transparent hover:bg-[var(--nb-well-hover)] active:bg-[var(--nb-well)]",
        nb_btn_danger:
          "bg-[var(--nb-sheet)] text-[var(--nb-danger)] border-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)] active:bg-[var(--nb-danger-wash)] active:shadow-[inset_0_0_0_var(--nb-border-1)_var(--nb-danger)]",
        nb_btn_link:
          "bg-transparent text-[var(--nb-link)] border-transparent underline-offset-4 hover:underline disabled:no-underline disabled:bg-transparent disabled:border-transparent disabled:text-[var(--nb-disabled-fg)]",
      },
      size: {
        nb_btn_sm:
          "min-h-[var(--nb-size-control-sm)] px-[var(--nb-space-3)] text-[length:var(--nb-text-xs)] gap-[var(--nb-space-2)]",
        nb_btn_md:
          "min-h-[var(--nb-size-control-md)] px-[var(--nb-space-5)] text-[length:var(--nb-text-sm)] gap-[var(--nb-space-2)]",
        nb_btn_lg:
          "min-h-[var(--nb-size-control-lg)] px-[var(--nb-space-6)] text-[length:var(--nb-text-md)] gap-[var(--nb-space-2)]",
        nb_btn_icon_sm:
          "min-h-[var(--nb-size-control-sm)] min-w-[var(--nb-size-control-sm)] h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] p-0 text-[length:var(--nb-text-xs)]",
        nb_btn_icon_md:
          "min-h-[var(--nb-size-control-md)] min-w-[var(--nb-size-control-md)] h-[var(--nb-size-control-md)] w-[var(--nb-size-control-md)] p-0 text-[length:var(--nb-text-sm)]",
        nb_btn_icon_lg:
          "min-h-[var(--nb-size-control-lg)] min-w-[var(--nb-size-control-lg)] h-[var(--nb-size-control-lg)] w-[var(--nb-size-control-lg)] p-0 text-[length:var(--nb-text-md)]",
      },
    },
    defaultVariants: {
      variant: "nb_btn_secondary",
      size: "nb_btn_md",
    },
  }
);

export type ButtonVariantsProps = VariantProps<typeof buttonVariants>;

function ButtonSpinner() {
  return (
    <span
      className="spin inline-block h-[1em] w-[1em] shrink-0 rounded-[var(--nb-radius-full)] border-[var(--nb-border-2)] border-solid border-current border-r-transparent animate-spin motion-reduce:animate-none"
      style={{ animationDuration: "var(--nb-dur-spin)" }}
      aria-hidden="true"
    />
  );
}

function getIconAttributes(size?: ButtonSize, isActive?: boolean) {
  const isLarge = size === "nb_btn_lg";
  return {
    size: isLarge ? sizeTokens["icon-md"] : sizeTokens["icon-sm"],
    weight: isActive
      ? iconTokens["weight-active"]
      : (isLarge
        ? iconTokens["weight-default"]
        : iconTokens["weight-small"]),
    className: isLarge
      ? "h-[var(--nb-size-icon-md)] w-[var(--nb-size-icon-md)] shrink-0"
      : "h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0",
  };
}

function getIconButtonIconAttributes(size?: ButtonSize, isActive?: boolean) {
  if (size === "nb_btn_icon_sm") {
    return {
      size: sizeTokens["icon-sm"],
      weight: isActive ? iconTokens["weight-active"] : iconTokens["weight-small"],
      className: "h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0",
    };
  }
  if (size === "nb_btn_icon_lg") {
    return {
      size: sizeTokens["icon-lg"],
      weight: isActive ? iconTokens["weight-active"] : iconTokens["weight-default"],
      className: "h-[var(--nb-size-icon-lg)] w-[var(--nb-size-icon-lg)] shrink-0",
    };
  }
  return {
    size: sizeTokens["icon-md"],
    weight: isActive ? iconTokens["weight-active"] : iconTokens["weight-default"],
    className: "h-[var(--nb-size-icon-md)] w-[var(--nb-size-icon-md)] shrink-0",
  };
}

export interface BaseButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
  loadingLabel?: string | undefined;
  leadingIcon?: PhosphorIcon | undefined;
  trailingIcon?: PhosphorIcon | undefined;
  active?: boolean | undefined;
  asChild?: boolean | undefined;
}

/**
Standard button with visible text
*/
export interface StandardButtonProps extends BaseButtonProps {
  size?: "nb_btn_sm" | "nb_btn_md" | "nb_btn_lg" | undefined;
  children: React.ReactNode;
}

/**
Standalone icon button: aria-label is strictly required
*/
export interface IconButtonProps
  extends Omit<
    BaseButtonProps,
    "size" | "children" | "leadingIcon" | "trailingIcon" | "loadingLabel"
  > {
  size: "nb_btn_icon_sm" | "nb_btn_icon_md" | "nb_btn_icon_lg";
  icon?: PhosphorIcon | undefined;
  "aria-label": string;
  children?: React.ReactNode | undefined;
}

export type ButtonProps = StandardButtonProps | IconButtonProps;

const Button = React.forwardRef<HTMLButtonElement, StandardButtonProps>(
  (
    {
      className,
      variant = "nb_btn_secondary",
      size = "nb_btn_md",
      loading = false,
      loadingLabel,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      active = false,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          aria-busy={loading ? "true" : undefined}
          aria-pressed={active ? "true" : undefined}
          disabled={loading || disabled}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    const iconAttrs = getIconAttributes(size, active);

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={loading || disabled}
        aria-busy={loading ? "true" : undefined}
        aria-pressed={active ? "true" : undefined}
        {...props}
      >
        {loading ? (
          <ButtonSpinner />
        ) : (LeadingIcon ? (
          <LeadingIcon
            size={iconAttrs.size}
            weight={iconAttrs.weight}
            aria-hidden="true"
            className={cn("shrink-0", iconAttrs.className)}
          />
        ) : null)}
        {loading && loadingLabel ? loadingLabel : children}
        {!loading && TrailingIcon ? (
          <TrailingIcon
            size={iconAttrs.size}
            weight={iconAttrs.weight}
            aria-hidden="true"
            className={cn("shrink-0", iconAttrs.className)}
          />
        ) : null}
      </Comp>
    );
  }
);
Button.displayName = "Button";

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant = "nb_btn_ghost",
      size,
      icon: IconComp,
      active = false,
      loading = false,
      asChild = false,
      disabled,
      children,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          aria-label={ariaLabel}
          aria-pressed={active ? "true" : undefined}
          aria-busy={loading ? "true" : undefined}
          disabled={loading || disabled}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    const iconAttrs = getIconButtonIconAttributes(size, active);

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        aria-label={ariaLabel}
        aria-pressed={active ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        disabled={loading || disabled}
        {...props}
      >
        {loading ? (
          <ButtonSpinner />
        ) : (IconComp ? (
          <IconComp
            size={iconAttrs.size}
            weight={iconAttrs.weight}
            aria-hidden="true"
            className={cn("shrink-0", iconAttrs.className)}
          />
        ) : (
          children
        ))}
      </Comp>
    );
  }
);
IconButton.displayName = "IconButton";

export { Button, IconButton, buttonVariants };
