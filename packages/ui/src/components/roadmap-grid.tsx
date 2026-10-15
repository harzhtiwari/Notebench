import * as React from "react";
import {
  ToolTile,
  type StudioToolItem,
  getRoadmapTools,
} from "./tool-tile.js";
import { cn } from "../lib/utils.js";

export interface RoadmapGridProps
  extends React.HTMLAttributes<HTMLDivElement> {
  tools?: readonly StudioToolItem[] | StudioToolItem[] | undefined;
  onSelectTool?: ((tool: StudioToolItem) => void) | undefined;
}

/**
 * RoadmapGrid: renders roadmap / coming-soon tools in a board-compliant 2-column grid
 * with disabled state and version milestone badges (Decision 1.8).
 */
export const RoadmapGrid = React.forwardRef<HTMLDivElement, RoadmapGridProps>(
  ({ tools, onSelectTool, className, ...props }, ref) => {
    const items = tools ?? getRoadmapTools();

    return (
      <div
        ref={ref}
        role="region"
        aria-label="Roadmap tools"
        className={cn(
          "tools grid grid-cols-2 gap-[var(--nb-space-2)]",
          className
        )}
        {...props}
      >
        {items.map((tool) => (
          <ToolTile
            key={tool.id}
            tool={tool}
            onSelect={onSelectTool}
          />
        ))}
      </div>
    );
  }
);
RoadmapGrid.displayName = "RoadmapGrid";
