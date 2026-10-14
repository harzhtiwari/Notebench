"use client";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./popover.js";
import { Button } from "./button.js";
import { ChartBar } from "./icons.js";
import {
  type DashboardMetrics,
  DASHBOARD_METRICS_CONFIG,
} from "@notebook/contracts";
import { formatBytes } from "../lib/formatters.js";

export interface MetricsPopoverProps {
  metrics: DashboardMetrics;
  onManageStorage?: (() => void) | undefined;
}

export function MetricsPopover({ metrics, onManageStorage }: MetricsPopoverProps) {
  const safeCap = metrics.storageSafeCapBytes || 5 * 1024 * 1024 * 1024;
  const storagePercentage = Math.min(
    100,
    Math.round((metrics.storageUsedBytes / safeCap) * 100)
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="metrics-popover-trigger"
          aria-label="Instance Metrics"
          className="h-8 w-8 p-0 text-[var(--nb-ink-2)]"
        >
          <ChartBar size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-[var(--nb-edge)] bg-[var(--nb-sheet)] p-4 text-[var(--nb-ink)] shadow-[var(--nb-shadow-float)]"
      >
        <div className="mb-3 flex items-center justify-between border-b border-[var(--nb-edge)]/40 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--nb-ink-3)]">
            Instance Telemetry
          </span>
          <span className="text-[11px] text-[var(--nb-ink-2)]">Local Offline</span>
        </div>

        <div className="space-y-3">
          {DASHBOARD_METRICS_CONFIG.map((config) => {
            if (config.id === "storageUsed") {
              return (
                <div key={config.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--nb-ink-2)]">{config.label}</span>
                    <span className="font-semibold text-[var(--nb-ink)]">
                      {formatBytes(metrics.storageUsedBytes)} / 5.0 GB Safe Cap
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nb-well)]">
                    <div
                      className="h-full bg-[var(--nb-ink-2)] transition-all"
                      style={{ width: `${Math.max(2, storagePercentage)}%` }}
                    />
                  </div>
                </div>
              );
            }

            if (config.id === "notebookCount") {
              return (
                <div key={config.id} className="flex justify-between text-xs">
                  <span className="text-[var(--nb-ink-2)]">{config.label}</span>
                  <span className="font-semibold text-[var(--nb-ink)]">
                    {metrics.notebookCount} Active
                  </span>
                </div>
              );
            }

            if (config.id === "sourceCount") {
              return (
                <div key={config.id} className="flex justify-between text-xs">
                  <span className="text-[var(--nb-ink-2)]">{config.label}</span>
                  <span className="font-semibold text-[var(--nb-ink)]">
                    {metrics.sourceCount} Files
                  </span>
                </div>
              );
            }

            if (config.id === "artifactCount") {
              return (
                <div key={config.id} className="flex justify-between text-xs">
                  <span className="text-[var(--nb-ink-2)]">{config.label}</span>
                  <span className="font-semibold text-[var(--nb-ink)]">
                    {metrics.artifactCount} Trees
                  </span>
                </div>
              );
            }

            return null;
          })}
        </div>

        <div className="mt-4 border-t border-[var(--nb-edge)]/40 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onManageStorage}
            className="w-full h-8 text-xs font-medium justify-between text-[var(--nb-ink)]"
          >
            <span>Manage Storage & Data</span>
            <span>→</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
