import * as React from "react";
import type { TargetMilestone } from "@notebook/contracts";
import { CheckCircle, XCircle } from "../primitives/icons.js";
import { VersionBadge } from "../primitives/badges.js";
import { cn } from "../../lib/utils.js";

export interface AuditTableRow {
  id?: string | undefined;
  control: string;
  reader?: string | undefined;
  writer?: string | undefined;
  status?: "pass" | "fail" | boolean | undefined;
  pass?: boolean | undefined;
  milestone?: TargetMilestone | undefined;
  description?: string | undefined;
  section?: string | undefined;
}

export interface AuditTableProps extends React.HTMLAttributes<HTMLDivElement> {
  rows: readonly AuditTableRow[];
  caption?: string | undefined;
  emptyMessage?: string | undefined;
}

/**
 * AuditTable renders a control / reader / writer / pass-fail table with board styling.
 * Reuses VersionBadge for roadmap milestone labelling.
 */
export const AuditTable = React.forwardRef<HTMLDivElement, AuditTableProps>(
  (
    {
      className,
      rows,
      caption = "Settings Truth Audit",
      emptyMessage = "No audit controls registered.",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={caption}
        className={cn(
          "overflow-x-auto max-w-full rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        <table className="w-full border-collapse text-left text-[length:var(--nb-text-sm)]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-[length:var(--nb-border-2)] border-[var(--nb-ink)] bg-[var(--nb-well)]">
              <th
                scope="col"
                className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] font-[number:var(--nb-weight-bold)] text-[var(--nb-ink)] whitespace-nowrap"
              >
                Control
              </th>
              <th
                scope="col"
                className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] font-[number:var(--nb-weight-bold)] text-[var(--nb-ink)] whitespace-nowrap"
              >
                Reader
              </th>
              <th
                scope="col"
                className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] font-[number:var(--nb-weight-bold)] text-[var(--nb-ink)] whitespace-nowrap"
              >
                Writer
              </th>
              <th
                scope="col"
                className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] font-[number:var(--nb-weight-bold)] text-[var(--nb-ink)] whitespace-nowrap"
              >
                Pass / Fail
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-[var(--nb-space-3)] py-[var(--nb-space-6)] text-center text-[var(--nb-ink-3)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const isPass =
                  row.status === "pass" || row.status === true || row.pass === true;
                const rowKey = row.id ?? `${row.control}-${idx}`;

                return (
                  <tr
                    key={rowKey}
                    className="border-b border-[var(--nb-hairline)] hover:bg-[var(--nb-well-hover)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none"
                  >
                    <th
                      scope="row"
                      className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] align-top font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)]"
                    >
                      <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
                        <span>{row.control}</span>
                        {row.milestone && (
                          <VersionBadge milestone={row.milestone} />
                        )}
                      </div>
                      {row.description && (
                        <p className="mt-[var(--nb-space-0-5)] text-[length:var(--nb-text-xs)] font-[number:var(--nb-weight-regular)] text-[var(--nb-ink-3)]">
                          {row.description}
                        </p>
                      )}
                    </th>
                    <td className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] align-top font-[family-name:var(--nb-font-mono)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                      {row.reader || "—"}
                    </td>
                    <td className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] align-top font-[family-name:var(--nb-font-mono)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                      {row.writer || "—"}
                    </td>
                    <td className="px-[var(--nb-space-3)] py-[var(--nb-space-2)] align-top whitespace-nowrap">
                      {isPass ? (
                        <span className="inline-flex items-center gap-[var(--nb-space-1)] font-[number:var(--nb-weight-bold)] text-[var(--nb-ok)]">
                          <CheckCircle
                            size={16}
                            weight="bold"
                            aria-hidden="true"
                          />
                          <span>Pass</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-[var(--nb-space-1)] font-[number:var(--nb-weight-bold)] text-[var(--nb-danger)]">
                          <XCircle
                            size={16}
                            weight="bold"
                            aria-hidden="true"
                          />
                          <span>Fail</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }
);

AuditTable.displayName = "AuditTable";
