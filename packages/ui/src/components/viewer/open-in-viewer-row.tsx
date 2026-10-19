import * as React from "react";
import { Button } from "../primitives/button.js";
import { BookOpenIcon, CaretRightIcon } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface OpenInViewerRowProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onOpen: (() => void) | undefined;
}

/**
"Open in Source Viewer" row (ticket 09): the citation-popover action that
opens the `ViewerModal` at the cited page. Icon + label always, never
icon-alone. The cited locator travels via the parent's `onOpen`.
*/
const OpenInViewerRow = React.forwardRef<
  HTMLButtonElement,
  OpenInViewerRowProps
>(({ className, onOpen, type = "button", ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant="nb_btn_ghost"
    size="nb_btn_sm"
    aria-label="Open in Source Viewer"
    leadingIcon={BookOpenIcon}
    trailingIcon={CaretRightIcon}
    onClick={() => {
      onOpen?.();
    }}
    className={cn("w-full", className)}
    {...props}
  >
    <span className="grow text-left">Open in Source Viewer</span>
  </Button>
));
OpenInViewerRow.displayName = "OpenInViewerRow";

export { OpenInViewerRow };
