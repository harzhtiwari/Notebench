import * as React from "react";
import { CloudDisclosureBadge } from "../primitives/badges.js";
import { KeyIcon } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface ProviderRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
  Provider display name (OpenAI, Anthropic, Ollama, …).
  */
  name: string;
  /**
  Helper line under the name (board `.help`).
  */
  description?: string | undefined;
  /**
  Cloud providers show the transmitted-data badge; local ones omit it.
  */
  cloud?: boolean | undefined;
  /**
  Name interpolated into the badge copy; defaults to `name`.
  */
  providerName?: string | undefined;
}

/**
Provider row in the board `.src` shape: icon tile + name/helper + action
slot. Key inputs and `KeyTestButton` are composed by the parent through
`children` — this row owns no inputs itself.
*/
const ProviderRow = React.forwardRef<HTMLDivElement, ProviderRowProps>(
  (
    { className, name, description, cloud = false, providerName, children, ...props },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[var(--nb-size-tile-icon)_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] px-[var(--nb-space-3)] py-[var(--nb-space-2)]",
        className
      )}
      {...props}
    >
      <span className="grid h-[var(--nb-size-tile-icon)] w-[var(--nb-size-tile-icon)] place-items-center rounded-[var(--nb-radius-menu)] bg-[var(--nb-sheet)] text-[var(--nb-ink-2)]">
        <KeyIcon size={20} aria-hidden="true" />
      </span>
      <div className="grid min-w-0 gap-[var(--nb-space-1)]">
        <div className="truncate text-sm font-semibold text-[var(--nb-ink)]">
          {name}
        </div>
        {description === undefined ? null : (
          <div className="text-xs text-[var(--nb-ink-3)]">{description}</div>
        )}
        {cloud ? (
          <div>
            <CloudDisclosureBadge providerName={providerName ?? name} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-[var(--nb-space-2)]">{children}</div>
    </div>
  )
);
ProviderRow.displayName = "ProviderRow";

export { ProviderRow };
