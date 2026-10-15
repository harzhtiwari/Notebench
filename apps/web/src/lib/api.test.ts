// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Ticket 07 RED suite (written before implementation).
 *
 * The API client defaults to same-origin paths (relative URLs reach the web
 * origin, which the sidecar proxies to the live backend); the explicit
 * backend-URL override keeps working for out-of-band consumers. Typed
 * backend errors are preserved through a narrow parser: the `{code,
 * message}` shape survives untouched, anything else falls back safely.
 */

const ENV_KEY = "NEXT_PUBLIC_API_URL";

async function loadApi(envValue: string | undefined): Promise<typeof import("./api")> {
  vi.resetModules();
  if (envValue === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = envValue;
  }
  return import("./api");
}

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

describe("ticket 07: same-origin API default", () => {
  it("resolves API paths against the web origin when no override is set", async () => {
    const api = await loadApi(undefined);
    expect(api.apiUrl("/api/healthz")).toBe("/api/healthz");
    expect(api.apiUrl("/api/app-state")).toBe("/api/app-state");
  });

  it("normalizes paths missing the leading slash", async () => {
    const api = await loadApi(undefined);
    expect(api.apiUrl("api/healthz")).toBe("/api/healthz");
  });

  it("keeps the explicit backend-URL override working", async () => {
    const api = await loadApi("http://127.0.0.1:41001");
    expect(api.apiUrl("/api/healthz")).toBe("http://127.0.0.1:41001/api/healthz");
  });
});

describe("ticket 07: typed backend errors are preserved", () => {
  it("preserves the error code and message shape", async () => {
    const api = await loadApi(undefined);
    expect(api.parseApiError({ error: { code: "SETUP_ALREADY_COMPLETED", message: "Done." } })).toEqual({
      code: "SETUP_ALREADY_COMPLETED",
      message: "Done.",
    });
  });

  it("falls back safely for unshaped payloads", async () => {
    const api = await loadApi(undefined);
    expect(api.parseApiError(null)).toEqual({ code: "UNKNOWN", message: "Request failed." });
    expect(api.parseApiError({ error: "boom" })).toEqual({ code: "UNKNOWN", message: "boom" });
    expect(api.parseApiError({ error: { code: 42 } })).toEqual({
      code: "UNKNOWN",
      message: "Request failed.",
    });
  });
});
