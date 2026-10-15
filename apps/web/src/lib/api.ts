/**
 * Resolves an API path against the configured backend daemon URL.
 * Defaults to same-origin paths (relative URLs reach the web origin, which
 * the sidecar proxies to the live backend). Set NEXT_PUBLIC_API_URL only
 * for out-of-band consumers that cannot use the web origin.
 */
const API_BASE = (process.env["NEXT_PUBLIC_API_URL"] ?? "").replace(/\/+$/, "");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

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
  if (isRecord(payload) === false) {
    return fallback;
  }
  const error: unknown = payload["error"];
  if (typeof error === "string") {
    return error === "" ? fallback : { code: "UNKNOWN", message: error };
  }
  if (isRecord(error) === false) {
    return fallback;
  }
  const record = error;
  if (typeof record["code"] !== "string" || typeof record["message"] !== "string") {
    return fallback;
  }
  if (record["code"] === "" || record["message"] === "") {
    return fallback;
  }
  return { code: record["code"], message: record["message"] };
}

/** Typed fetch failure carrying the backend's error code. */
export class ApiRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

/**
 * Fetch an API path through the same-origin default and parse the JSON body.
 * Non-ok responses throw the typed backend error (never `[object Object]`);
 * network failures propagate untouched.
 */
export async function fetchApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  if (response.ok) {
    return (await response.json()) as T;
  }
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  const parsed = parseApiError(payload);
  throw new ApiRequestError(parsed.code, parsed.message);
}
