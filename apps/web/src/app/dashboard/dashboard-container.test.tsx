// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { NotebookSummary, DashboardMetrics } from "@notebook/contracts";

import { DashboardContainer } from "./dashboard-container";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const NOTEBOOKS: NotebookSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    title: "Field Notes",
    trashedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-10T15:00:00.000Z",
    sourcesCount: 1,
    artifactsCount: 0,
    storageBytes: 1024,
    sourceFileNames: ["a.pdf"],
  },
];

const METRICS: DashboardMetrics = {
  storageUsedBytes: 1024,
  storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
  notebookCount: 1,
  sourceCount: 1,
  artifactCount: 0,
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("dashboard container (ticket 05)", () => {
  it("loads notebooks and metrics from the daemon and renders them", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/notebooks")) return json({ notebooks: NOTEBOOKS });
      if (url.endsWith("/api/notebooks/metrics")) return json({ metrics: METRICS });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardContainer />);
    expect(screen.getByText("Loading notebooks...")).toBeDefined();
    await screen.findByText("Field Notes");
    expect(screen.getByTestId("storage-summary")).toBeDefined();
  });

  it("instant create posts an untitled notebook and opens it (B2)", async () => {
    const seen: Array<{ url: string; init?: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, init });
        if (url.endsWith("/api/notebooks") && init?.method === "POST") {
          return json({ notebook: { id: "new-notebook-id" } }, 201);
        }
        if (url.endsWith("/api/notebooks")) return json({ notebooks: NOTEBOOKS });
        if (url.endsWith("/api/notebooks/metrics")) return json({ metrics: METRICS });
        throw new Error(`unexpected request: ${url}`);
      })
    );

    render(<DashboardContainer />);
    await screen.findByText("Field Notes");
    fireEvent.click(screen.getByRole("button", { name: "+ New Notebook" }));

    await waitFor(() => {
      const post = seen.find((s) => s.init?.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({ title: "Untitled Notebook" });
    });
    await waitFor(() => {
      expect(window.location.href).toContain("/notebooks/new-notebook-id");
    });
  });

  it("hides the model banner when a chat model is configured", async () => {
    window.localStorage.setItem("notebench:model:configured", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/notebooks")) return json({ notebooks: NOTEBOOKS });
        if (url.endsWith("/api/notebooks/metrics")) return json({ metrics: METRICS });
        throw new Error(`unexpected request: ${url}`);
      })
    );

    render(<DashboardContainer />);
    await screen.findByText("Field Notes");
    expect(screen.queryByTestId("no-model-banner")).toBeNull();
  });

  it("ignores malformed daemon payloads instead of crashing (unknown-narrow)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/notebooks")) return json({ notebooks: "oops" });
        if (url.endsWith("/api/notebooks/metrics")) return json({ metrics: "oops" });
        throw new Error(`unexpected request: ${url}`);
      })
    );

    render(<DashboardContainer />);
    await screen.findByText("+ Create Notebook");
    expect(screen.queryByText("Field Notes")).toBeNull();
  });

  it("uses owned navigate (no document reload) for instant create when provided", async () => {
    const navigated: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/notebooks") && init?.method === "POST") {
          return json({ notebook: { id: "owned-nav-id" } }, 201);
        }
        if (url.endsWith("/api/notebooks")) return json({ notebooks: NOTEBOOKS });
        if (url.endsWith("/api/notebooks/metrics")) return json({ metrics: METRICS });
        throw new Error(`unexpected request: ${url}`);
      })
    );

    render(<DashboardContainer navigate={(to) => navigated.push(to)} />);
    await screen.findByText("Field Notes");
    fireEvent.click(screen.getByRole("button", { name: "+ New Notebook" }));

    await waitFor(() => {
      expect(navigated).toEqual(["/notebooks/owned-nav-id"]);
    });
  });
});
