import * as React from "react";
import { Button } from "../primitives/button.js";
import { Badge } from "../primitives/badges.js";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  FileText,
  Notebook,
  Trash,
  Warning,
} from "../primitives/icons.js";
import { formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";

export interface TrashedItem {
  id: string;
  title: string;
  type?: "notebook" | "source" | (string & {}) | undefined;
  trashedAt: string | Date | number;
  daysRemaining?: number | undefined;
  byteSize?: number | undefined;
}

export interface TrashRowProps
  extends Omit<React.HTMLAttributes<HTMLTableRowElement>, "id"> {
  item?: TrashedItem | undefined;
  id?: string | undefined;
  title?: string | undefined;
  type?: "notebook" | "source" | (string & {}) | undefined;
  trashedAt?: string | Date | number | undefined;
  daysRemaining?: number | undefined;
  onRestore?: ((id: string) => void) | undefined;
  onPurge?: ((id: string) => void) | undefined;
  isRestoring?: boolean | undefined;
  isPurging?: boolean | undefined;
  disabled?: boolean | undefined;
}

const CELL_CLASS =
  "px-[var(--nb-space-3)] py-[var(--nb-space-2)] text-[length:var(--nb-text-sm)] text-[var(--nb-ink)] align-middle";

function normalizeTrashedEpochMs(trashedAt: string | Date | number): number {
  if (typeof trashedAt === "number") {
    return trashedAt < 1e11 ? trashedAt * 1000 : trashedAt;
  }
  if (typeof trashedAt === "string") {
    const trimmed = trashedAt.trim();
    if (/^\d{9,10}$/.test(trimmed)) {
      return Number(trimmed) * 1000;
    }
    return new Date(trimmed).getTime();
  }
  return trashedAt.getTime();
}

/**
 * Computes remaining retention days out of 30 days based on trashed timestamp.
 * Correctly handles ISO strings, Date objects, Unix epoch seconds (SQLite unixepoch()),
 * and Unix epoch milliseconds.
 */
export function computeDaysRemaining(trashedAt: string | Date | number): number {
  const trashedMs = normalizeTrashedEpochMs(trashedAt);
  if (Number.isNaN(trashedMs)) return 30;
  const elapsedMs = Math.max(0, Date.now() - trashedMs);
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

function formatTrashedTime(trashedAt: string | Date | number): string {
  try {
    const epochMs = normalizeTrashedEpochMs(trashedAt);
    if (Number.isNaN(epochMs)) return "recently";
    return formatRelativeTime(new Date(epochMs).toISOString());
  } catch {
    return "recently";
  }
}

/**
 * TrashRow: Displays a soft-trashed notebook or source with its trashed timestamp,
 * 30-day retention countdown, and paired Restore & Purge actions.
 *
 * Architectural Divergence (Ticket 21):
 * NotebookRow provides 7 fixed dashboard columns without countdown; TrashRow diverges
 * by providing trashed timestamp, days remaining (30-day countdown), and paired Restore
 * (`ArrowCounterClockwise`) & Purge (`Trash`) actions for both notebooks and sources.
 *
 * Invariant (Rule 1.2): Zero elevation shadows.
 * Invariant (Rule 1.4): Days remaining and risk tags pair color with explicit icons & text.
 */
const TrashRow = React.forwardRef<HTMLTableRowElement, TrashRowProps>(
  (
    {
      className,
      item,
      id,
      title,
      type,
      trashedAt,
      daysRemaining,
      onRestore,
      onPurge,
      isRestoring = false,
      isPurging = false,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const effectiveId = item?.id ?? id ?? "";
    const effectiveTitle = item?.title ?? title ?? "Untitled";
    const effectiveType = item?.type ?? type ?? "notebook";
    const effectiveTrashedAt = item?.trashedAt ?? trashedAt ?? new Date();
    const effectiveDaysRemaining =
      item?.daysRemaining ??
      daysRemaining ??
      computeDaysRemaining(effectiveTrashedAt);

    const isNotebook = effectiveType === "notebook";
    const isUrgent = effectiveDaysRemaining <= 3;

    return (
      <tr
        ref={ref}
        className={cn(
          "transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none hover:bg-[var(--nb-well)] border-b border-[var(--nb-hairline)]",
          className
        )}
        {...props}
      >
        {/* Emblem & Title */}
        <td className={CELL_CLASS}>
          <div className="flex items-center gap-[var(--nb-space-2)]">
            <span className="grid h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] place-items-center rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] text-[var(--nb-ink-2)] shrink-0">
              {isNotebook ? (
                <Notebook size={16} aria-hidden="true" />
              ) : (
                <FileText size={16} aria-hidden="true" />
              )}
            </span>
            <span className="font-[number:var(--nb-weight-medium)] text-[var(--nb-ink)] truncate max-w-[var(--nb-layout-title-min)]">
              {effectiveTitle}
            </span>
          </div>
        </td>

        {/* Item Type */}
        <td className={CELL_CLASS}>
          <Badge variant="default" className="capitalize">
            {effectiveType}
          </Badge>
        </td>

        {/* Trashed Timestamp */}
        <td className={CELL_CLASS}>
          <span className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-3)] tabular-nums">
            {formatTrashedTime(effectiveTrashedAt)}
          </span>
        </td>

        {/* Days Remaining (30-day Countdown) */}
        <td className={CELL_CLASS}>
          {isUrgent ? (
            <Badge
              variant="warn"
              icon={<Warning size={14} weight="fill" aria-hidden="true" />}
            >
              {effectiveDaysRemaining} {effectiveDaysRemaining === 1 ? "day" : "days"} remaining
            </Badge>
          ) : (
            <Badge
              variant="default"
              icon={<ClockCounterClockwise size={14} aria-hidden="true" />}
            >
              {effectiveDaysRemaining} {effectiveDaysRemaining === 1 ? "day" : "days"} remaining
            </Badge>
          )}
        </td>

        {/* Paired Actions: Restore & Purge */}
        <td className={CELL_CLASS}>
          <div
            className="flex items-center gap-[var(--nb-space-2)]"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Button
              type="button"
              variant="nb_btn_secondary"
              size="nb_btn_sm"
              disabled={disabled || isRestoring || isPurging}
              onClick={() => {
                onRestore?.(effectiveId);
              }}
              aria-label="Restore"
              leadingIcon={ArrowCounterClockwise}
            >
              Restore
            </Button>
            <Button
              type="button"
              variant="nb_btn_danger"
              size="nb_btn_sm"
              disabled={disabled || isRestoring || isPurging}
              onClick={() => {
                onPurge?.(effectiveId);
              }}
              aria-label="Delete permanently"
              leadingIcon={Trash}
            >
              Delete permanently
            </Button>
          </div>
        </td>
      </tr>
    );
  }
);
TrashRow.displayName = "TrashRow";

export { TrashRow };
