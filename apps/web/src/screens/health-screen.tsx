"use client";

import { useCallback, useEffect, useState } from "react";
import type { DoctorReport, HealthProbeResult } from "@notebook/contracts";
import { HEALTH_PROBE_DESCRIPTORS } from "@notebook/contracts";
import { AlertBanner, Button, StatusCard } from "@notebook/ui";
import { ApiRequestError, fetchApiJson } from "../lib/api";

const THRESHOLD_LABELS: ReadonlyMap<string, string> = new Map(
  HEALTH_PROBE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor.thresholdLabel]),
);

/**
 * System Health screen (ticket 24, NOTEBENCH 1.30/1.44/8.8).
 * Renders the six `/api/doctor` probe results as `StatusCard`s and surfaces
 * the exposure probe result a second time as an `AlertBanner` — banner and
 * sixth card read the SAME probe object, never a second fetch.
 */
export function HealthScreen() {
  const [probes, setProbes] = useState<ReadonlyArray<HealthProbeResult> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const runProbe = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const report = await fetchApiJson<DoctorReport>("/api/doctor");
      if (!Array.isArray(report.probes) || report.probes.length !== 6) {
        setError("Could not load System Health. The daemon returned an unexpected report.");
        setProbes(null);
        return;
      }
      setProbes(report.probes);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError(`Could not load System Health (${err.code}): ${err.message}`);
      } else {
        setError(
          err instanceof Error
            ? `Could not load System Health: ${err.message}`
            : "Could not load System Health.",
        );
      }
      setProbes(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  const exposure =
    probes?.find((probe) => probe.id === "exposure") ?? null;
  const showExposureBanner = exposure !== null && exposure.status !== "pass";

  return (
    <main className="min-h-screen bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-[var(--nb-space-4)]">
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)]">
          <h1 className="text-xl font-bold tracking-tight">System Health</h1>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              void runProbe();
            }}
          >
            Run Full Diagnostic Probe
          </Button>
        </div>

        {loading && probes === null ? (
          <p className="text-sm text-[var(--nb-ink-2)]">Checking system health…</p>
        ) : null}

        {error !== undefined ? <p className="text-sm text-[var(--nb-danger)]">{error}</p> : null}

        {probes !== null ? (
          <>
            {showExposureBanner && exposure !== null ? (
              <AlertBanner tone="warn" message={exposure.message} />
            ) : null}
            <div className="grid gap-[var(--nb-space-3)] md:grid-cols-2">
              {probes.map((probe) => (
                <StatusCard
                  key={probe.id}
                  probe={probe}
                  thresholdLabel={THRESHOLD_LABELS.get(probe.id)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
