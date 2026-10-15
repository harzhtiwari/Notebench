// @vitest-environment happy-dom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { HealthProbeResult } from "@notebook/contracts";

import { HealthScreen } from "./health-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function probe(
  id: HealthProbeResult["id"],
  name: string,
  status: HealthProbeResult["status"],
  message: string,
): HealthProbeResult {
  return { id, name, status, message };
}

function doctorPayload(exposureHost: string, exposureStatus: "pass" | "warn") {
  return {
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: 10,
    memory: { rss: 1, heapTotal: 1, heapUsed: 1, external: 1 },
    probes: [
      probe("node_runtime", "Node.js Runtime", "pass", "Node.js v24.15.0 satisfies >= 22.0.0"),
      probe("python_worker", "Python Doc-Worker Pool", "pass", "Worker responsive (5ms, Python 3.12.2)"),
      probe("sqlite_wal", "SQLite Database", "pass", "SQLite journal mode is wal"),
      probe("sqlite_vec", "Vector Store", "pass", "sqlite-vec loaded (v0.1.9)"),
      probe("disk_capacity", "Disk Capacity", "pass", "Disk free: 6.00 GB (>= 5 GB)"),
      exposureStatus === "warn"
        ? probe(
            "exposure",
            "Exposure Alert",
            "warn",
            "Security Notice: Notebench is accessible on your local network without a passcode. Set a passcode in Account Settings.",
          )
        : probe("exposure", "Exposure Alert", "pass", `Bound to loopback interface (${exposureHost})`),
    ],
  };
}

function stubDoctor(payload: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("HealthScreen ticket 24 (RED)", () => {
  it("renders six status cards from a single /api/doctor fetch", async () => {
    const fetchMock = stubDoctor(doctorPayload("127.0.0.1", "pass"));
    render(<HealthScreen />);

    for (const name of [
      "Node.js Runtime",
      "Python Doc-Worker Pool",
      "SQLite Database",
      "Vector Store",
      "Disk Capacity",
      "Exposure Alert",
    ]) {
      await screen.findByRole("heading", { name });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/doctor"), undefined);
  });

  it("shows the exposure banner AND the sixth card from the SAME probe result on non-loopback bind", async () => {
    const fetchMock = stubDoctor(doctorPayload("0.0.0.0", "warn"));
    render(<HealthScreen />);

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain(
      "Security Notice: Notebench is accessible on your local network",
    );
    // Sixth card still rendered from the same single fetch — no second request.
    await screen.findByLabelText("Exposure Alert: Warning");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides the exposure banner when bound to loopback", async () => {
    stubDoctor(doctorPayload("127.0.0.1", "pass"));
    render(<HealthScreen />);

    await screen.findByLabelText("Exposure Alert: Pass");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("re-runs the full diagnostic probe on demand", async () => {
    const fetchMock = stubDoctor(doctorPayload("127.0.0.1", "pass"));
    render(<HealthScreen />);

    const button = await screen.findByRole("button", { name: /run full diagnostic probe/i });
    fireEvent.click(button);
    await screen.findByLabelText("Node.js Runtime: Pass");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces fetch failure with a retry action and no cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    render(<HealthScreen />);

    await screen.findByText(/could not load system health/i);
    expect(screen.queryByLabelText(/Node.js Runtime/)).toBeNull();
  });

  it("surfaces the typed daemon error code instead of a generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { code: "DOCTOR_TIMEOUT", message: "Probe timed out." } }),
      })),
    );
    render(<HealthScreen />);

    await screen.findByText(/DOCTOR_TIMEOUT/);
    await screen.findByText(/Probe timed out\./);
    expect(screen.queryByLabelText(/Node.js Runtime/)).toBeNull();
  });
});
