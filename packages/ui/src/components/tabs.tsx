import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../lib/utils.js";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-[var(--nb-r-control,6px)] bg-[var(--nb-well,#D8DEE3)] p-1 text-[var(--nb-ink-2,#33405E)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-[calc(var(--nb-r-control,6px)-2px)] px-3 py-1 text-xs font-medium text-[var(--nb-ink-2,#33405E)] transition-all focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink,#14213D)] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--nb-sheet,#F6F8F9)] data-[state=active]:text-[var(--nb-ink,#14213D)] data-[state=active]:shadow-xs",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-[2px] focus-visible:outline-[var(--nb-ink,#14213D)]",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
