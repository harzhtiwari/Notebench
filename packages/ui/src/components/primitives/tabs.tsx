import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils.js";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-0-5)] text-[var(--nb-ink-2)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-[var(--nb-size-control-sm)] items-center justify-center gap-[var(--nb-space-2)] whitespace-nowrap rounded-[var(--nb-radius-chip)] px-[var(--nb-space-4)] leading-[var(--nb-leading-none)] text-[length:var(--nb-text-xs)] font-[family-name:var(--nb-font-ui)] font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink-2)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] disabled:pointer-events-none disabled:bg-[var(--nb-disabled-bg)] disabled:text-[var(--nb-disabled-fg)] data-[state=active]:bg-[var(--nb-ink)] data-[state=active]:text-[var(--nb-ink-inv)]",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-[var(--nb-space-2)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
