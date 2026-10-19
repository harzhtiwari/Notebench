import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { CaretDownIcon, resolveIconProps } from "./icons.js";
import { cn } from "../../lib/utils.js";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b border-[var(--nb-hairline)]", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between gap-[var(--nb-space-2)] py-[var(--nb-space-3)] text-[length:var(--nb-text-sm)] leading-[var(--nb-leading-ui)] font-[number:var(--nb-weight-medium)] text-[var(--nb-ink)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:underline focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props}
    >
      {children}
      <CaretDownIcon
        {...resolveIconProps({ size: "sm" })}
        className="h-[var(--nb-size-icon-sm)] w-[var(--nb-size-icon-sm)] shrink-0 text-[var(--nb-ink-2)] transition-transform duration-[var(--nb-dur-base)] ease-[var(--nb-ease)] motion-reduce:transition-none"
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-[length:var(--nb-text-sm)] leading-[var(--nb-leading-ui)] text-[var(--nb-ink-2)] duration-[var(--nb-dur-base)] motion-reduce:duration-0 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-[var(--nb-space-4)] pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
