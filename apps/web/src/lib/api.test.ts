// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
Ticket 07 RED suite (written before implementation).

The API client defaults to same-origin paths (relative URLs reach the web
origin, which the sidecar proxies to the live backend); the explicit
backend-URL override keeps working for out-of-band consumers. Typed
backend errors are preserved through a narrow parser: the `{code,
message}` shape survives untouched, anything else falls back safely.
*/

const ENV_KEY = "NEXT_PUBLIC_API_URL";

async function loadApi(envValue: string | undefined): Promise<typeof import("./api")> {
  vi.resetModules();
  if (envValue === undefined) {
    Reflect.deleteProperty(process.env, ENV_KEY);
  } else {
    process.env[ENV_KEY] = envValue;
  }
  return import("./api");
}

/**
Resolves to the fulfilled value or to the rejection reason, mirroring the
`then(onFulfilled, onRejected)` shape without a promise chain.
*/
async function captureFailure(task: Promise<unknown>): Promise<unknown> {
  try {
    await task;
    return null;
  } catch (error: unknown) {
    return error;
  }
}

function stubFetchOnce(response: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

afterEach(() => {
  Reflect.deleteProperty(process.env, ENV_KEY);
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

  it("strips trailing slashes from the override so no double slash appears", async () => {
    const api = await loadApi("http://127.0.0.1:41001/");
    expect(api.apiUrl("/api/healthz")).toBe("http://127.0.0.1:41001/api/healthz");
    const api2 = await loadApi("http://127.0.0.1:41001///");
    expect(api2.apiUrl("api/healthz")).toBe("http://127.0.0.1:41001/api/healthz");
  });
});

describe("ticket 07: typed backend errors are preserved", () => {  it("preserves the error code and message shape", async () => {
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

describe("ticket 07: typed fetch preserves backend errors end to end", () => {
  it("resolves parsed JSON when the backend responds ok", async () => {
    const api = await loadApi(undefined);
    stubFetchOnce({ ok: true, json: async () => ({ status: "ok" }) });
    await expect(api.fetchApiJson("/api/healthz")).resolves.toEqual({ status: "ok" });
    vi.unstubAllGlobals();
  });

  it("throws the typed backend code/message when the daemon answers an error", async () => {
    const api = await loadApi(undefined);
    const { ApiRequestError } = api;
    stubFetchOnce({
      ok: false,
      json: async () => ({ error: { code: "SETUP_ALREADY_COMPLETED", message: "Done." } }),
    });
    const failure = await captureFailure(api.fetchApiJson("/api/setup"));
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as InstanceType<typeof ApiRequestError>).code).toBe("SETUP_ALREADY_COMPLETED");
    expect((failure as Error).message).toContain("Done.");
    vi.unstubAllGlobals();
  });

  it("falls back to UNKNOWN for malformed error bodies and rethrows network failures", async () => {
    const api = await loadApi(undefined);
    const { ApiRequestError } = api;
    stubFetchOnce({ ok: false, json: async () => null });
    const malformed = await captureFailure(api.fetchApiJson("/api/doctor"));
    expect(malformed).toBeInstanceOf(ApiRequestError);
    expect((malformed as InstanceType<typeof ApiRequestError>).code).toBe("UNKNOWN");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    await expect(api.fetchApiJson("/api/doctor")).rejects.toThrow("connection refused");
    vi.unstubAllGlobals();
  });
});

describe("ticket 01 UI: field issues surface from validation errors", () => {
  const ISSUES_PAYLOAD = {
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid setup parameters",
      details: {
        issues: [
          { path: ["passcode"], message: "Too small: expected string to have >=15 characters" },
          { path: ["owner", "email"], message: "Invalid email" },
          { path: [3], message: "Numeric path segment" },
          { message: "Issue without a path" },
          { path: "not-an-array", message: "Malformed path shape" },
          "not-an-issue-object",
        ],
      },
    },
  };

  const EXPECTED_ISSUES = [
    { path: "passcode", message: "Too small: expected string to have >=15 characters" },
    { path: "owner.email", message: "Invalid email" },
    { path: "3", message: "Numeric path segment" },
  ];

  it("projects details.issues onto dot-joined field paths and drops malformed entries", async () => {
    const api = await loadApi(undefined);
    expect(api.parseApiError(ISSUES_PAYLOAD)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Invalid setup parameters",
      issues: EXPECTED_ISSUES,
    });
  });

  it("carries no issues key when the payload has none (shape stays {code,message})", async () => {
    const api = await loadApi(undefined);
    const parsed = api.parseApiError({ error: { code: "X", message: "y" } });
    expect(Object.hasOwn(parsed, "issues")).toBe(false);
    expect(parsed).toEqual({ code: "X", message: "y" });
  });

  it("fetchApiJson attaches the issues to the thrown ApiRequestError", async () => {
    const api = await loadApi(undefined);
    const { ApiRequestError } = api;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ISSUES_PAYLOAD })));
    const failure = await captureFailure(api.fetchApiJson("/api/setup"));
    expect(failure).toBeInstanceOf(ApiRequestError);
    const thrown = failure as InstanceType<typeof ApiRequestError>;
    expect(thrown.code).toBe("VALIDATION_ERROR");
    expect(thrown.issues).toEqual(EXPECTED_ISSUES);
    vi.unstubAllGlobals();
  });
});
