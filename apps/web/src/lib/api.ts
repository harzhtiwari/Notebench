/**
 * Resolves an API path against the configured backend daemon URL.
 * Defaults to same-origin paths (relative URLs reach the web origin, which
 * the sidecar proxies to the live backend). Set NEXT_PUBLIC_API_URL only
 * for out-of-band consumers that cannot use the web origin.
 */
const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

/** Typed backend error preserved from the server response. */
export interface ApiError {
  code: string;
  message: string;
}

/**
 * Narrow an arbitrary failure payload to the typed backend error shape.
 * The `{code, message}` shape survives untouched; string errors keep their
 * text under the UNKNOWN code; anything else falls back safely so callers
 * never render `[object Object]` or crash on malformed bodies.
 */
export function parseApiError(payload: unknown): ApiError {
  const fallback: ApiError = { code: "UNKNOWN", message: "Request failed." };
  if (typeof payload === "string") {
    return payload === "" ? fallback : { code: "UNKNOWN", message: payload };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallback;
  }
  const error: unknown = (payload as Record<string, unknown>)["error"];
  if (typeof error === "string") {
    return error === "" ? fallback : { code: "UNKNOWN", message: error };
  }
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return fallback;
  }
  const record = error as Record<string, unknown>;
  if (typeof record["code"] !== "string" || typeof record["message"] !== "string") {
    return fallback;
  }
  if (record["code"] === "" || record["message"] === "") {
    return fallback;
  }
  return { code: record["code"], message: record["message"] };
}
