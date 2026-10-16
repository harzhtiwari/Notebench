import * as React from "react";
import { formatBytes } from "../../lib/formatters.js";
import { HardDrive } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

/** Default safe cap matching PRD 1.34 (5.0 GB). */
export const DEFAULT_STORAGE_SAFE_CAP_BYTES = 5 * 1024 * 1024 * 1024;

/** Canonical chart series color tokens from docs/ui/tokens.json. */
export const CHART_SERIES_TOKENS = [
  "var(--nb-chart-1)",
  "var(--nb-chart-2)",
  "var(--nb-chart-3)",
  "var(--nb-chart-4)",
] as const;

/** Board semantic classes for the 4 chart series. */
export const CHART_SERIES_CLASSES = ["c1", "c2", "c3", "c4"] as const;

export interface StorageCategoryItem {
  /** Identifier for category (e.g. 'database', 'uploads', 'artifacts', 'vault', 'cache', 'logs'). */
  id: string;
  /** Human-readable direct label (e.g. 'Database', 'Uploads'). */
  label: string;
  /** Consumed storage in bytes. */
  bytes: number;
  /** Optional custom color token or variable override. */
  color?: string | undefined;
  /** Optional descriptive note. */
  description?: string | undefined;
}

export interface UsageBarProps {
  /** Breakdown per category. */
  categories: readonly StorageCategoryItem[];
  /** Safe cap in bytes. Defaults to 5.0 GB (5 * 1024 * 1024 * 1024). */
  capBytes?: number | undefined;
  /** Custom total bytes override (if different from sum of categories). */
  totalBytes?: number | undefined;
  /** Title or label for the usage bar section. Defaults to "Storage Usage". */
  title?: string | undefined;
  /** Whether to show the composite progress meter. Defaults to true. */
  showMeter?: boolean | undefined;
  /** Additional container classes (using var(--nb-*) only). */
  className?: string | undefined;
}

/**
 * UsageBar (Issue 22 / Ticket 23): Storage usage breakdown against the 5.0 GB safe cap.
 * Composes board .chart, .chart-row, and .chart-bar patterns.
 * Invariant: Never color-alone — pairs series colors with explicit direct labels and formatted sizes.
 * Invariant: Elevation shadow invariant — zero float shadows on in-page elements.
 */
export function UsageBar({
  categories,
  capBytes = DEFAULT_STORAGE_SAFE_CAP_BYTES,
  totalBytes,
  title = "Storage Usage",
  showMeter = true,
  className,
}: UsageBarProps): React.JSX.Element {
  const computedTotal = React.useMemo(() => {
    if (typeof totalBytes === "number") return Math.max(0, totalBytes);
    return categories.reduce((acc, cat) => acc + Math.max(0, cat.bytes), 0);
  }, [totalBytes, categories]);

  const percentage = React.useMemo(() => {
    if (capBytes <= 0) return 0;
    return Math.min(100, Math.round((computedTotal / capBytes) * 100));
  }, [computedTotal, capBytes]);

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-5)]",
        className
      )}
    >
      {/* Header with Title, HardDrive icon, and Total / Safe Cap summary */}
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--nb-space-2)] pb-[var(--nb-space-3)]">
        <div className="flex items-center gap-[var(--nb-space-2)]">
          <HardDrive
            size={16}
            className="text-[var(--nb-ink-2)]"
            aria-hidden="true"
          />
          <h3 className="font-semibold text-[var(--nb-ink)] text-[var(--nb-text-md)]">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-[var(--nb-space-2)] text-[var(--nb-text-sm)]">
          <span className="font-semibold text-[var(--nb-ink)]">
            {formatBytes(computedTotal)}
          </span>
          <span className="text-[var(--nb-ink-3)]">
            of {formatBytes(capBytes)} ({percentage}%)
          </span>
        </div>
      </div>

      {/* Composite multi-series progress meter */}
      {showMeter && (
        <div
          role="progressbar"
          aria-valuenow={computedTotal}
          aria-valuemin={0}
          aria-valuemax={capBytes}
          aria-label={`${title}: ${formatBytes(computedTotal)} of ${formatBytes(capBytes)} used (${percentage}%)`}
          className="relative flex h-[var(--nb-size-icon-md)] w-full overflow-hidden rounded-[var(--nb-radius-xs)] border border-[var(--nb-hairline)] bg-[var(--nb-well)]"
        >
          {categories.map((cat, idx) => {
            if (cat.bytes <= 0 || capBytes <= 0) return null;
            const catPct = Math.min(100, (cat.bytes / capBytes) * 100);
            const seriesClass = CHART_SERIES_CLASSES[idx % CHART_SERIES_CLASSES.length];
            const tokenColor = CHART_SERIES_TOKENS[idx % CHART_SERIES_TOKENS.length];
            return (
              <span
                key={cat.id}
                className={cn("chart-bar h-full transition-all", seriesClass)}
                style={{
                  width: `${catPct}%`,
                  backgroundColor: cat.color ?? tokenColor,
                }}
                title={`${cat.label}: ${formatBytes(cat.bytes)}`}
              />
            );
          })}
        </div>
      )}

      {/* Detailed breakdown list composing board .chart and .chart-row */}
      <div className="chart mt-[var(--nb-space-4)]">
        {categories.map((cat, idx) => {
          const catPct =
            capBytes > 0
              ? Math.min(100, Math.max(0, (cat.bytes / capBytes) * 100))
              : 0;
          const seriesClass = CHART_SERIES_CLASSES[idx % CHART_SERIES_CLASSES.length];
          const tokenColor = CHART_SERIES_TOKENS[idx % CHART_SERIES_TOKENS.length];
          return (
            <div key={cat.id} className="chart-row">
              <span className="truncate font-medium text-[var(--nb-ink)] text-[var(--nb-text-sm)]">
                {cat.label}
              </span>
              <div className="h-[var(--nb-size-icon-md)] w-full overflow-hidden rounded-[var(--nb-radius-xs)] bg-[var(--nb-well)]">
                <span
                  className={cn("chart-bar block h-full", seriesClass)}
                  style={{
                    width: `${catPct}%`,
                    backgroundColor: cat.color ?? tokenColor,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span className="num mono text-right font-mono text-[var(--nb-ink-2)] text-[var(--nb-text-xs)]">
                {formatBytes(cat.bytes)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
