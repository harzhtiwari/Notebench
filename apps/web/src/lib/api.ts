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
  /** Field issues projected from `details.issues`; absent when the payload has none. */
  readonly issues?: readonly ApiFieldIssue[];
}

/** One server-side field issue (sanitizer validation issue projected to a field path). */
export interface ApiFieldIssue {
  readonly path: string;
  readonly message: string;
}

/** Materialized issue objects accepted into the projected list. */
interface RawIssue {
  readonly path?: unknown;
  readonly message?: unknown;
}

function projectIssues(value: unknown): ApiFieldIssue[] | undefined {
  if (isRecord(value) === false) {
    return undefined;
  }
  const issues = value["issues"];
  if (Array.isArray(issues) === false) {
    return undefined;
  }
  const projected: ApiFieldIssue[] = [];
  for (const raw of issues) {
    if (isRecord(raw) === false) {
      continue;
    }
    const candidate = raw as RawIssue;
    if (Array.isArray(candidate.path) === false || typeof candidate.message !== "string") {
      continue;
    }
    const path = candidate.path
      .filter((segment): segment is string | number => {
        return typeof segment === "string" || typeof segment === "number";
      })
      .map(String)
      .join(".");
    if (path === "") {
      continue;
    }
    projected.push({ path, message: candidate.message });
  }
  return projected.length > 0 ? projected : undefined;
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
  const issues = projectIssues(record["details"]);
  if (issues === undefined) {
    return { code: record["code"], message: record["message"] };
  }
  return { code: record["code"], message: record["message"], issues };
}

/** Typed fetch failure carrying the backend's error code and optional field issues. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly issues: readonly ApiFieldIssue[];

  constructor(code: string, message: string, issues: readonly ApiFieldIssue[] = []) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.issues = issues;
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
  throw new ApiRequestError(parsed.code, parsed.message, parsed.issues ?? []);
}
