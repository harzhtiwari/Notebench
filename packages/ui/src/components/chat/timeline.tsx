import * as React from "react";
import {
  GitBranchIcon,
  LockIcon,
  SparkleIcon,
  PencilSimpleIcon,
  WarningIcon,
  QuestionIcon,
} from "../primitives/icons.js";
import { CitationPopover } from "../primitives/overlays.js";
import { CitationChip } from "../primitives/citations.js";
import { Badge } from "../primitives/badges.js";
import { cn } from "../../lib/utils.js";

export type TimelineEventState =
  | "ai"
  | "you"
  | "locked"
  | "stale"
  | "milestone"
  | "normal";

export interface TimelineCitation {
  id?: string | undefined;
  title?: string | undefined;
  location?: React.ReactNode | undefined;
  passage?: React.ReactNode | undefined;
  snippet?: string | undefined;
  sourceId?: string | undefined;
  label?: React.ReactNode | undefined;
  onOpenSource?: (() => void) | undefined;
}

export interface TimelineEventItem {
  id: string;
  date?: string | undefined | null;
  title: string;
  description?: React.ReactNode | undefined;
  citations?: TimelineCitation[] | undefined;
  locked?: boolean | undefined;
  state?: TimelineEventState | undefined;
  icon?: React.ReactNode | undefined;
  marker?: React.ReactNode | undefined;
  badge?: React.ReactNode | undefined;
  tools?: React.ReactNode | undefined;
}

/**
Checks if a string represents a valid timeline date.
Accepts:
- Year-only strings (e.g. "1776", "2024")
- ISO 8601 timestamps and calendar dates (e.g. "2024-04-12", "2024-04-12T10:30:00Z")
Rejects:
- Empty, null, undefined, "unknown", "undated", or non-parsable strings
*/
export function isValidTimelineDate(dateStr: string | undefined | null): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const trimmed = dateStr.trim();
  if (
    trimmed === "" ||
    trimmed.toLowerCase() === "unknown" ||
    trimmed.toLowerCase() === "undated"
  ) {
    return false;
  }
  // 1-4 digit year format (e.g. "1776", "2024", "-500")
  if (/^-?\d{1,4}$/.test(trimmed)) {
    const year = Number(trimmed);
    return !Number.isNaN(year) && year >= -9999 && year <= 9999;
  }
  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

/**
Returns a UTC timestamp in milliseconds for sorting timeline dates.
Returns null if date is missing, unknown, or invalid.
*/
export function getTimelineTimestamp(dateStr: string | undefined | null): number | null {
  if (!isValidTimelineDate(dateStr)) return null;
  const trimmed = dateStr ? dateStr.trim() : "";
  if (/^-?\d{1,4}$/.test(trimmed)) {
    const year = Number(trimmed);
    return yearOnlyTimestamp(year);
  }
  return Date.parse(trimmed);
}

/**
Jan 1 UTC of a year-only token. `Date.UTC` remaps years 0-99 to 1900-1999,
so the year is applied with `setUTCFullYear` to keep it literal.
*/
function yearOnlyTimestamp(year: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, 0, 1);
  return date.getTime();
}

/**
Formats a timeline date string into a user-facing label.
Year-only strings are kept as-is (e.g. "1776").
Valid ISO strings are formatted via Intl.DateTimeFormat in UTC.
Unknown or invalid dates return fallbackLabel (defaults to "Date unknown").
*/
export function formatTimelineDate(
  dateStr: string | undefined | null,
  options?: Intl.DateTimeFormatOptions,
  fallbackLabel = "Date unknown"
): string {
  if (!isValidTimelineDate(dateStr)) return fallbackLabel;
  const trimmed = dateStr ? dateStr.trim() : "";
  if (/^-?\d{1,4}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new Date(trimmed);
    const formatter = new Intl.DateTimeFormat(
      "en-US",
      options ?? {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }
    );
    return formatter.format(parsed);
  } catch {
    return trimmed;
  }
}

/**
Sorts timeline events chronologically.
Valid dated entries sort first (oldest to newest by default, or desc if specified).
Undated / unknown / invalid date entries always sort last.
*/
export function sortTimelineEvents<T extends { date?: string | undefined | null }>(
  events: readonly T[],
  direction: "asc" | "desc" = "asc"
): T[] {
  return events
    .map((event, index) => ({ event, index, time: getTimelineTimestamp(event.date) }))
    .toSorted((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index;
      if (a.time === null) return 1;
      if (b.time === null) return -1;

      return direction === "asc" ? a.time - b.time : b.time - a.time;
    })
    .map((entry) => entry.event);
}

export interface TimelineEventProps
  extends React.LiHTMLAttributes<HTMLLIElement> {
  id?: string | undefined;
  date?: string | undefined | null;
  title: string;
  description?: React.ReactNode | undefined;
  citations?: TimelineCitation[] | undefined;
  locked?: boolean | undefined;
  state?: TimelineEventState | undefined;
  icon?: React.ReactNode | undefined;
  marker?: React.ReactNode | undefined;
  badge?: React.ReactNode | undefined;
  tools?: React.ReactNode | undefined;
  dateFormatOptions?: Intl.DateTimeFormatOptions | undefined;
  unknownDateLabel?: string | undefined;
  isLast?: boolean | undefined;
  children?: React.ReactNode | undefined;
}

/**
TimelineEvent: individual event entry along a TimelineTrack (ticket 17).
Reuses CitationPopover from ticket 11 for citations and grounding details.
Strictly adheres to elevation shadow invariant (zero shadows on in-page cards).
*/
export const TimelineEvent = React.forwardRef<HTMLLIElement, TimelineEventProps>(
  (
    {
      className,
      id,
      date,
      title,
      description,
      citations,
      locked,
      state = "normal",
      icon,
      marker,
      badge,
      tools,
      dateFormatOptions,
      unknownDateLabel = "Date unknown",
      isLast = true,
      children,
      ...props
    },
    ref
  ) => {
    const isDated = isValidTimelineDate(date);
    const formattedDate = formatTimelineDate(date, dateFormatOptions, unknownDateLabel);

    return (
      <li
        ref={ref}
        id={id}
        className={cn(
          "timeline-event relative flex gap-[var(--nb-space-4)] pb-[var(--nb-space-6)] text-[var(--nb-ink)] last:pb-0",
          className
        )}
        {...props}
      >
        {/* Continuous Track Spine (vertical connecting line) */}
        {isLast ? null : (
          <span
            aria-hidden="true"
            className="absolute left-[calc(var(--nb-size-control-sm)/2-var(--nb-border-1)/2)] top-[var(--nb-size-control-sm)] bottom-0 w-[var(--nb-border-1)] bg-[var(--nb-hairline)]"
          />
        )}

        {/* Node Marker along the track */}
        <div className="relative z-[var(--nb-z-raised)] shrink-0">
          {marker ?? (
            <div
              data-slot="timeline-marker"
              className="flex h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] items-center justify-center rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] text-[var(--nb-ink-2)]"
            >
              {icon ?? <GitBranchIcon size={16} aria-hidden="true" />}
            </div>
          )}
        </div>

        {/* Event Content Card (In-page element: NO shadow!) */}
        <div className="relative flex-1 rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)]">
          {/* Header Row: Date + State Badges + Tools */}
          <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)] pb-[var(--nb-space-2)]">
            <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
              {isDated ? (
                <time
                  dateTime={date ? date.trim() : undefined}
                  className="text-[length:var(--nb-text-xs)] font-[number:var(--nb-weight-semibold)] uppercase tracking-[var(--nb-tracking-tight)] text-[var(--nb-ink-3)]"
                >
                  {formattedDate}
                </time>
              ) : (
                <Badge
                  data-slot="date-badge"
                  variant="default"
                  icon={<QuestionIcon size={12} aria-hidden="true" className="shrink-0" />}
                  className="rounded-[var(--nb-radius-tag)] border border-[var(--nb-hairline)] text-[length:var(--nb-text-2xs)] font-[number:var(--nb-weight-medium)] text-[var(--nb-ink-3)]"
                >
                  {unknownDateLabel}
                </Badge>
              )}

              {/* State Badge (Never color-alone: icon + label) */}
              {state === "milestone" ? (
                <Badge
                  data-slot="state-badge"
                  variant="ai"
                  icon={<GitBranchIcon size={12} aria-hidden="true" />}
                >
                  Milestone
                </Badge>
              ) : null}

              {state === "ai" ? (
                <Badge
                  data-slot="state-badge"
                  variant="ai"
                  icon={<SparkleIcon size={12} aria-hidden="true" />}
                >
                  AI
                </Badge>
              ) : null}

              {state === "you" ? (
                <Badge
                  data-slot="state-badge"
                  variant="you"
                  icon={<PencilSimpleIcon size={12} aria-hidden="true" />}
                >
                  You
                </Badge>
              ) : null}

              {state === "stale" ? (
                <Badge
                  data-slot="state-badge"
                  variant="warn"
                  icon={<WarningIcon size={12} aria-hidden="true" />}
                >
                  Stale
                </Badge>
              ) : null}

              {/* Locked Badge (Never color-alone: icon + label) */}
              {locked ? (
                <Badge
                  data-slot="locked-badge"
                  variant="default"
                  icon={<LockIcon size={12} aria-hidden="true" />}
                >
                  Locked
                </Badge>
              ) : null}

              {badge}
            </div>

            {tools ? <div className="flex items-center gap-[var(--nb-space-2)]">{tools}</div> : null}
          </div>

          {/* Title */}
          <h4 className="text-[length:var(--nb-text-sm)] font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)]">{title}</h4>

          {/* Description */}
          {description ? (
            <div className="mt-[var(--nb-space-1)] text-[length:var(--nb-text-sm)] leading-[var(--nb-leading-ui)] text-[var(--nb-ink-2)]">
              {description}
            </div>
          ) : null}

          {/* Custom children */}
          {children}

          {/* Citations Row (Reusing CitationPopover from Ticket 11) */}
          {citations && citations.length > 0 ? (
            <div
              role="group"
              aria-label="Citations"
              className="mt-[var(--nb-space-3)] flex flex-wrap items-center gap-[var(--nb-space-2)]"
            >
              {citations.map((cite, index) => {
                const label = cite.label ?? `[${index + 1}]`;
                const titleText = cite.title ?? "Source Document";
                return (
                  <CitationPopover
                    key={cite.id ?? `cite-${index}`}
                    title={titleText}
                    location={cite.location}
                    passage={cite.passage ?? cite.snippet}
                    onOpenSource={cite.onOpenSource}
                  >
                    <CitationChip
                      label={label}
                      aria-label={cite.title ? `Citation: ${cite.title}` : `Citation ${index + 1}`}
                    />
                  </CitationPopover>
                );
              })}
            </div>
          ) : null}
        </div>
      </li>
    );
  }
);
TimelineEvent.displayName = "TimelineEvent";

export interface TimelineTrackProps
  extends React.OlHTMLAttributes<HTMLOListElement> {
  /**
  Optional array of timeline events to render
  */
  events?: TimelineEventItem[] | undefined;
  /**
  Direction to sort events when `events` array is provided. Defaults to "asc". Set to false to disable auto-sort.
  */
  sortDirection?: "asc" | "desc" | false | undefined;
  /**
  Custom render function for each event when `events` array is provided
  */
  renderEvent?: ((event: TimelineEventItem, index: number, isLast: boolean) => React.ReactNode) | undefined;
  children?: React.ReactNode | undefined;
}

/**
TimelineTrack: track container for timeline events (ticket 17).
Applies .timeline-track semantic class and accessible role.
*/
export const TimelineTrack = React.forwardRef<HTMLOListElement, TimelineTrackProps>(
  (
    {
      className,
      events,
      sortDirection = "asc",
      renderEvent,
      children,
      "aria-label": ariaLabel = "Timeline",
      ...props
    },
    ref
  ) => {
    let resolvedEvents: TimelineEventItem[] = [];
    if (events) {
      resolvedEvents =
        sortDirection === false
          ? [...events]
          : sortTimelineEvents(events, sortDirection);
    }

    return (
      <ol
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "timeline-track relative m-0 w-full list-none p-0 text-[var(--nb-ink)]",
          className
        )}
        {...props}
      >
        {children ??
          resolvedEvents.map((event, index) => {
            const isLast = index === resolvedEvents.length - 1;
            if (renderEvent) {
              return (
                <React.Fragment key={event.id}>
                  {renderEvent(event, index, isLast)}
                </React.Fragment>
              );
            }
            return (
              <TimelineEvent
                key={event.id}
                id={event.id}
                date={event.date}
                title={event.title}
                description={event.description}
                citations={event.citations}
                locked={event.locked}
                state={event.state}
                icon={event.icon}
                marker={event.marker}
                badge={event.badge}
                tools={event.tools}
                isLast={isLast}
              />
            );
          })}
      </ol>
    );
  }
);
TimelineTrack.displayName = "TimelineTrack";
