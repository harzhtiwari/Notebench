import * as React from "react";
import { FilePdf, FileText, Globe, CheckCircle } from "./icons.js";
import { cn } from "../lib/utils.js";

export type IngestFormat = "pdf" | "docx" | "txt" | "md" | "web" | "note";
export type IngestState =
  | "queued"
  | "parsing"
  | "embedding"
  | "ready"
  | "failed";

export interface ProgressRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Source display name; also the progressbar accessible name. */
  name: string;
  format: IngestFormat;
  state: IngestState;
  /** 0–100 completion. */
  value: number;
  /** Server-sanitised failure reason, shown only when state is failed. */
  error?: string | undefined;
}

function FormatIcon({ format }: { format: IngestFormat }): React.JSX.Element {
  if (format === "pdf") {
    return <FilePdf size={20} aria-hidden="true" />;
  }
  if (format === "web") {
    return <Globe size={20} aria-hidden="true" />;
  }
  return <FileText size={20} aria-hidden="true" />;
}

/**
 * Per-Source ingest progress (ticket 08): board `.progress` bar with
 * `role="progressbar"` exactly like the job-progress section, plus a format
 * tile and an ok-role `Indexed` badge when ready. Presentational only — queue
 * states and values arrive via props (SSE lands with the parent ticket).
 */
const ProgressRow = React.forwardRef<HTMLDivElement, ProgressRowProps>(
  ({ className, name, format, state, value, error, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[var(--nb-size-tile-icon)_minmax(0,1fr)_auto] items-center gap-[var(--nb-space-3)] rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] px-[var(--nb-space-3)] py-[var(--nb-space-2)]",
        className
      )}
      {...props}
    >
      <span className="grid h-[var(--nb-size-tile-icon)] w-[var(--nb-size-tile-icon)] place-items-center rounded-[var(--nb-radius-menu)] bg-[var(--nb-sheet)] text-[var(--nb-ink-2)]">
        <FormatIcon format={format} />
      </span>
      <div className="grid min-w-0 gap-[var(--nb-space-1)]">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-[var(--nb-ink)]">
          {name}
        </div>
        <div
          role="progressbar"
          aria-label={name}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[var(--nb-size-progress)] w-full overflow-hidden rounded-[var(--nb-radius-full)] bg-[var(--nb-sheet)]"
        >
          <i
            aria-hidden="true"
            style={{ width: `${value}%` }}
            className="block h-full rounded-[var(--nb-radius-full)] bg-[var(--nb-ink)]"
          />
        </div>
        {state === "failed" && error !== undefined ? (
          <p className="text-xs text-[var(--nb-danger)]">{error}</p>
        ) : null}
      </div>
      <span className="grid justify-items-end">
        {state === "ready" ? (
          <span className="inline-flex items-center gap-[var(--nb-space-1)] whitespace-nowrap rounded-[var(--nb-radius-chip)] bg-[var(--nb-ok-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold leading-[var(--nb-leading-ui)] text-[var(--nb-ok)]">
            <CheckCircle size={14} aria-hidden="true" className="shrink-0" />
            Indexed
          </span>
        ) : (
          <span className="text-xs capitalize text-[var(--nb-ink-2)]">
            {state}
          </span>
        )}
      </span>
    </div>
  )
);
ProgressRow.displayName = "ProgressRow";

export { ProgressRow };
