import * as React from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  
} from "react-resizable-panels";
import { cn } from "../../lib/utils.js";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) => (
  <PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = Panel;

interface ResizableHandleProps
  extends React.ComponentProps<typeof PanelResizeHandle> {
  withHandle?: boolean;
}

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: ResizableHandleProps) => (
  <PanelResizeHandle
    className={cn(
      "group relative flex w-[var(--nb-space-3)] items-center justify-center bg-transparent transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:bg-[var(--nb-well-hover)] focus-visible:outline focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)] data-[panel-group-direction=vertical]:h-[var(--nb-space-3)] data-[panel-group-direction=vertical]:w-full",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-[var(--nb-z-raised)] flex h-[var(--nb-space-6)] w-[var(--nb-space-1)] items-center justify-center rounded-[var(--nb-radius-control)] bg-[var(--nb-edge)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none group-hover:bg-[var(--nb-ink)]" />
    )}
  </PanelResizeHandle>
);

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  
};

export {type ImperativePanelHandle} from "react-resizable-panels";