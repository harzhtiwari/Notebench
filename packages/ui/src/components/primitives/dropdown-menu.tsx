import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CaretRightIcon, CheckIcon, CircleIcon, resolveIconProps } from "./icons.js";
import { cn } from "../../lib/utils.js";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex min-h-[var(--nb-size-control-sm)] cursor-default select-none items-center rounded-[calc(var(--nb-radius-menu)-var(--nb-space-1))] px-[var(--nb-space-3)] py-[var(--nb-space-1)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] outline-none transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[highlighted]:bg-[var(--nb-well-hover)] data-[state=open]:bg-[var(--nb-well-hover)]",
      inset && "pl-[var(--nb-space-8)]",
      className
    )}
    {...props}
  >
    {children}
    <CaretRightIcon
      {...resolveIconProps({ size: "sm" })}
      className="ml-auto h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0 text-[var(--nb-ink-2)]"
    />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-[var(--nb-z-popover)] min-w-[var(--nb-space-24)] overflow-hidden rounded-[var(--nb-radius-menu)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-[var(--nb-space-1)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-float)] duration-[var(--nb-dur-fast)] motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[var(--nb-z-popover)] min-w-[var(--nb-space-24)] overflow-hidden rounded-[var(--nb-radius-menu)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-[var(--nb-space-1)] text-[var(--nb-ink)] shadow-[var(--nb-shadow-float)] duration-[var(--nb-dur-fast)] motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-[var(--nb-size-control-sm)] cursor-default select-none items-center rounded-[calc(var(--nb-radius-menu)-var(--nb-space-1))] px-[var(--nb-space-3)] py-[var(--nb-space-1)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] outline-none transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[highlighted]:bg-[var(--nb-well-hover)] data-[disabled]:pointer-events-none data-[disabled]:text-[var(--nb-disabled-fg)]",
      inset && "pl-[var(--nb-space-8)]",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex min-h-[var(--nb-size-control-sm)] cursor-default select-none items-center rounded-[calc(var(--nb-radius-menu)-var(--nb-space-1))] py-[var(--nb-space-1)] pl-[var(--nb-space-8)] pr-[var(--nb-space-3)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] outline-none transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[highlighted]:bg-[var(--nb-well-hover)] data-[disabled]:pointer-events-none data-[disabled]:text-[var(--nb-disabled-fg)]",
      className
    )}
    {...(checked === undefined ? {} : { checked })}
    {...props}
  >
    <span className="absolute left-[var(--nb-space-2)] flex h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <CheckIcon
          {...resolveIconProps({ size: "sm" })}
          className="h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0"
        />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex min-h-[var(--nb-size-control-sm)] cursor-default select-none items-center rounded-[calc(var(--nb-radius-menu)-var(--nb-space-1))] py-[var(--nb-space-1)] pl-[var(--nb-space-8)] pr-[var(--nb-space-3)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] outline-none transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none data-[highlighted]:bg-[var(--nb-well-hover)] data-[disabled]:pointer-events-none data-[disabled]:text-[var(--nb-disabled-fg)]",
      className
    )}
    {...props}
  >
    <span className="absolute left-[var(--nb-space-2)] flex h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <CircleIcon
          weight="fill"
          aria-hidden="true"
          className="h-[var(--nb-space-2)] w-[var(--nb-space-2)] shrink-0"
        />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-[var(--nb-space-3)] py-[var(--nb-space-1)] text-[length:var(--nb-text-xs)] font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink-2)]",
      inset && "pl-[var(--nb-space-8)]",
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn(
      "-mx-[var(--nb-space-1)] my-[var(--nb-space-1)] h-[var(--nb-border-1)] bg-[var(--nb-hairline)]",
      className
    )}
    {...props}
  />
));
DropdownMenuSeparator.displayName =
  DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto font-[family-name:var(--nb-font-mono)] text-[length:var(--nb-text-2xs)] text-[var(--nb-ink-3)]",
        className
      )}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
