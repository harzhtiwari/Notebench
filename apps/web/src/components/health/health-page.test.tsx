// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { HealthProbeResult } from "@notebook/contracts";
import { HealthView } from "./HealthView";

describe("Health Page & Exposure Banner (Ticket 24 - RED phase)", () => {
  const healthyProbes: HealthProbeResult[] = [
    {
      id: "node_runtime",
      name: "Node.js Runtime",
      status: "pass",
      message: "Node.js v22.13.1 satisfies >= 22.0.0",
    },
    {
      id: "python_worker",
      name: "Python Doc-Worker Pool",
      status: "pass",
      message: "Worker responsive (Python 3.12.0)",
    },
    {
      id: "sqlite_wal",
      name: "SQLite Database",
      status: "pass",
      message: "SQLite journal mode is wal",
    },
    {
      id: "sqlite_vec",
      name: "Vector Store",
      status: "pass",
      message: "sqlite-vec loaded (v0.1.9)",
    },
    {
      id: "disk_capacity",
      name: "Disk Capacity",
      status: "pass",
      message: "Disk free: 120.00 GB",
    },
    {
      id: "exposure",
      name: "Exposure Alert",
      status: "pass",
      message: "Bound to loopback (127.0.0.1)",
    },
  ];

  it("renders exactly six diagnostic cards matching NOTEBENCH 1.30 and 8.8", () => {
    render(<HealthView probes={healthyProbes} />);

    expect(screen.getByTestId("health-card-node_runtime")).toBeDefined();
    expect(screen.getByTestId("health-card-python_worker")).toBeDefined();
    expect(screen.getByTestId("health-card-sqlite_wal")).toBeDefined();
    expect(screen.getByTestId("health-card-sqlite_vec")).toBeDefined();
    expect(screen.getByTestId("health-card-disk_capacity")).toBeDefined();
    expect(screen.getByTestId("health-card-exposure")).toBeDefined();

    expect(screen.queryByTestId("exposure-alert-banner")).toBeNull();
  });

  it("displays prominent exposure alert banner and card when daemon is bound to non-loopback", () => {
    const exposedProbes: HealthProbeResult[] = healthyProbes.map((p) =>
      p.id === "exposure"
        ? {
            ...p,
            status: "warn" as const,
            message:
              "Security Notice: Notebench is accessible on your local network without a passcode. Set a passcode in Account Settings.",
          }
        : p
    );

    render(<HealthView probes={exposedProbes} />);

    const banner = screen.getByTestId("exposure-alert-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("Security Notice: Notebench is accessible on your local network without a passcode");

    const exposureCard = screen.getByTestId("health-card-exposure");
    expect(exposureCard.textContent).toContain("Security Notice");
  });

  it("displays warning card when disk capacity is 4 GB", () => {
    const lowDiskProbes: HealthProbeResult[] = healthyProbes.map((p) =>
      p.id === "disk_capacity"
        ? {
            ...p,
            status: "warn" as const,
            message: "Disk low: 4.00 GB free (1–5 GB warning)",
          }
        : p
    );

    render(<HealthView probes={lowDiskProbes} />);

    const diskCard = screen.getByTestId("health-card-disk_capacity");
    expect(diskCard.textContent).toContain("4.00 GB");
    expect(diskCard.getAttribute("data-status")).toBe("warn");
  });

  it("displays fail card when disk capacity is 0.5 GB", () => {
    const criticalDiskProbes: HealthProbeResult[] = healthyProbes.map((p) =>
      p.id === "disk_capacity"
        ? {
            ...p,
            status: "fail" as const,
            message: "Disk critical: 0.50 GB free (< 1 GB failure)",
          }
        : p
    );

    render(<HealthView probes={criticalDiskProbes} />);

    const diskCard = screen.getByTestId("health-card-disk_capacity");
    expect(diskCard.textContent).toContain("0.50 GB");
    expect(diskCard.getAttribute("data-status")).toBe("fail");
  });

  it("renders [Run Full Diagnostic Probe] button and triggers refresh on click", () => {
    const onRefresh = vi.fn();
    render(<HealthView probes={healthyProbes} onRefresh={onRefresh} />);

    const refreshButton = screen.getByTestId("btn-refresh-diagnostics");
    expect(refreshButton).toBeDefined();
    expect(refreshButton.textContent).toContain("Run Full Diagnostic Probe");

    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
