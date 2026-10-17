"use client";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../primitives/overlays.js";
import { Button, IconButton } from "../primitives/button.js";
import { MetricRow } from "../primitives/metric-row.js";
import { ChartBar } from "../primitives/icons.js";
import {
  type DashboardMetrics,
  DASHBOARD_METRICS_CONFIG,
} from "@notebench/contracts";
import { formatBytes } from "../../lib/formatters.js";

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
        <IconButton
          variant="nb_btn_secondary"
          size="nb_btn_icon_sm"
          icon={ChartBar}
          data-testid="metrics-popover-trigger"
          aria-label="Instance Metrics"
          className="text-[var(--nb-ink-2)]"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[var(--nb-layout-popover-w)]">
        <div className="mb-[var(--nb-space-3)] flex items-center justify-between border-b border-[var(--nb-hairline)] pb-[var(--nb-space-2)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--nb-ink-3)]">
            Instance Telemetry
          </span>
          <span className="text-[var(--nb-text-2xs)] text-[var(--nb-ink-2)]">Local Offline</span>
        </div>

        <div className="space-y-[var(--nb-space-3)]">
          {DASHBOARD_METRICS_CONFIG.map((config) => {
            if (config.id === "storageUsed") {
              return (
                <MetricRow
                  key={config.id}
                  label={config.label}
                  value={`${formatBytes(metrics.storageUsedBytes)} / 5.0 GB Safe Cap`}
                  fraction={storagePercentage / 100}
                />
              );
            }

            if (config.id === "notebookCount") {
              return (
                <MetricRow
                  key={config.id}
                  label={config.label}
                  value={`${metrics.notebookCount} Active`}
                />
              );
            }

            if (config.id === "sourceCount") {
              return (
                <MetricRow
                  key={config.id}
                  label={config.label}
                  value={`${metrics.sourceCount} Files`}
                />
              );
            }

            if (config.id === "artifactCount") {
              return (
                <MetricRow
                  key={config.id}
                  label={config.label}
                  value={`${metrics.artifactCount} Trees`}
                />
              );
            }

            return null;
          })}
        </div>

        <div className="mt-[var(--nb-space-4)] border-t border-[var(--nb-hairline)] pt-[var(--nb-space-3)]">
          <Button
            variant="nb_btn_secondary"
            size="nb_btn_sm"
            onClick={onManageStorage}
            className="w-full h-[var(--nb-size-control-sm)] text-xs font-medium justify-between text-[var(--nb-ink)]"
          >
            <span>Manage Storage & Data</span>
            <span>→</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
