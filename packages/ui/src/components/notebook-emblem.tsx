import * as React from "react";
import { Notebook } from "./icons.js";
import { cn } from "../lib/utils.js";

/**
 * Shared notebook emblem. Replaces the old emoji glyph with the catalog
 * `Notebook` icon (a literal emoji icon is a bug): used by `NotebookCard`, `NotebookRow`, and
 * any future notebook surface.
 */
const NotebookEmblem = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("inline-flex text-[var(--nb-ink-2)]", className)}
    {...props}
  >
    <Notebook size={20} aria-hidden="true" />
  </span>
));
NotebookEmblem.displayName = "NotebookEmblem";

export { NotebookEmblem };
