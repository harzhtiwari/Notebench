"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { HealthProbeResult, DoctorReport } from "@notebook/contracts";
import { HEALTH_PROBE_DESCRIPTORS } from "@notebook/contracts";
import { Warning } from "@notebook/ui";
import { apiUrl } from "../../lib/api";

interface HealthViewProps {
  probes?: HealthProbeResult[] | undefined;
  onRefresh?: (() => void) | undefined;
}

const ExposureBanner: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div
      data-testid="exposure-alert-banner"
      role="alert"
      className="p-4 rounded-lg bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs flex items-start gap-3 shadow-lg mb-6"
    >
      <Warning size={18} weight="fill" className="text-amber-400 shrink-0 mt-0.5 select-none" />
      <div className="flex-1">
        <div className="font-semibold text-amber-100 mb-0.5 tracking-tight">
          Public Network Exposure Alert
        </div>
        <p className="leading-relaxed text-amber-200/90">{message}</p>
      </div>
    </div>
  );
};

const HealthCard: React.FC<{
  probe: HealthProbeResult;
  thresholdLabel?: string | undefined;
}> = ({ probe, thresholdLabel }) => {
  const isPass = probe.status === "pass";
  const isWarn = probe.status === "warn";

  const statusLabel = isPass ? "PASS" : isWarn ? "WARN" : "FAIL";

  const badgeStyles = isPass
    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/80"
    : isWarn
      ? "bg-amber-950/60 text-amber-400 border-amber-800/80"
      : "bg-rose-950/60 text-rose-400 border-rose-800/80";

  const cardBorder = isPass
    ? "border-zinc-800/80 hover:border-zinc-700/80"
    : isWarn
      ? "border-amber-700/60 bg-amber-950/10"
      : "border-rose-700/60 bg-rose-950/10";

  return (
    <div
      data-testid={`health-card-${probe.id}`}
      data-status={probe.status}
      className={`rounded-lg border p-4 bg-zinc-900/60 backdrop-blur-xs flex flex-col justify-between transition-all ${cardBorder}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-zinc-100 tracking-tight truncate">
          {probe.name}
        </h4>
        <span
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-sm border uppercase ${badgeStyles}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="text-[11px] text-zinc-300 leading-relaxed mb-3 font-mono break-words">
        {probe.message}
      </p>

      {thresholdLabel && (
        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
          <span>Threshold:</span>
          <span className="font-mono text-zinc-300">{thresholdLabel}</span>
        </div>
      )}
    </div>
  );
};

export const HealthView: React.FC<HealthViewProps> = ({
  probes: externalProbes,
  onRefresh,
}) => {
  const [internalProbes, setInternalProbes] = useState<HealthProbeResult[] | undefined>(
    externalProbes
  );
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const fetchDoctor = useCallback(async () => {
    setIsLoading(true);
    try {
      if (typeof window === "undefined") return;
      const res = await fetch(apiUrl("/api/doctor")).catch(() => null);
      if (res && res.ok) {
        const report = (await res.json().catch(() => null)) as DoctorReport | null;
        if (report && Array.isArray(report.probes)) {
          setInternalProbes(report.probes);
          setLastCheck(new Date(report.timestamp).toLocaleTimeString());
        }
      }
    } catch {
      // Keep existing state on transient fetch error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (externalProbes) {
      setInternalProbes(externalProbes);
    } else {
      void fetchDoctor();
    }
  }, [externalProbes, fetchDoctor]);

  const handleRefresh = useCallback(() => {
    if (onRefresh) {
      onRefresh();
    } else {
      void fetchDoctor();
    }
  }, [onRefresh, fetchDoctor]);

  const activeProbes = externalProbes ?? internalProbes ?? [];

  // Match probe with threshold metadata from contracts
  const descriptorMap = new Map(
    HEALTH_PROBE_DESCRIPTORS.map((d) => [d.id, d.thresholdLabel])
  );

  // Probe 6 exposure alert check (shown as banner AND card from same probe result)
  const exposureProbe = activeProbes.find((p) => p.id === "exposure");
  const isExposed = exposureProbe && exposureProbe.status !== "pass";

  return (
    <div className="w-full space-y-5" data-testid="health-diagnostics-view">
      {/* Header with Run Diagnostics button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">System Diagnostics</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            6-point real-time health probe inspection matching /api/doctor
            {lastCheck ? ` • Last updated: ${lastCheck}` : ""}
          </p>
        </div>
        <button
          type="button"
          data-testid="btn-refresh-diagnostics"
          disabled={isLoading}
          onClick={handleRefresh}
          className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 border border-zinc-700 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? "Running Probes..." : "Run Full Diagnostic Probe"}
        </button>
      </div>

      {/* Exposure Warning Banner (Decision 1.44 & 6.9) */}
      {isExposed && exposureProbe && (
        <ExposureBanner message={exposureProbe.message} />
      )}

      {/* Six Health Diagnostic Cards (Decision 1.30 & 8.8) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {activeProbes.map((probe) => (
          <HealthCard
            key={probe.id}
            probe={probe}
            thresholdLabel={descriptorMap.get(probe.id)}
          />
        ))}
      </div>
    </div>
  );
};
