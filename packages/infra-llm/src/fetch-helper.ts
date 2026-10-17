import { ProviderError, type ProviderFailureCategory, type TestKeyResult } from "./types.js";

/** Default per-call timeout (Ticket 04 §3: every provider call has a timeout). */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Provider error bodies are excerpted, never embedded whole, in messages. */
const MAX_MESSAGE_EXCERPT = 300;

export interface ProviderHttpResult {
  readonly status: number;
  readonly statusText: string;
  readonly bodyText: string;
  readonly latencyMs: number;
}

/** Maps HTTP status to the Ticket 04 failure taxonomy. */
function categorizeStatus(status: number): ProviderFailureCategory {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500 && status <= 599) {
    return "server_error";
  }
  if (status >= 400 && status <= 499) {
    return "bad_request";
  }
  return "network_error";
}

/**
 * Builds the failure message for a non-OK provider response.
 * The message may echo provider text verbatim — scrubbing happens at the
 * `apps/server` boundary, never here (Guard 11).
 */
function failureMessage(status: number, statusText: string, bodyText: string): string {
  const excerpt = bodyText.slice(0, MAX_MESSAGE_EXCERPT).trim();
  if (excerpt.length === 0) {
    return `${String(status)} ${statusText}`;
  }
  return `${String(status)} ${statusText}: ${excerpt}`;
}

/** Walks the error cause chain looking for undici's redirect refusal. */
function isRedirectRefusal(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!(current instanceof Error)) {
      return false;
    }
    if (/redirect/i.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Single GET against a provider list/test endpoint.
 * Always sends `redirect: "error"` and `AbortSignal.timeout`.
 * Throws {@link ProviderError} on every failure mode.
 */
export async function providerGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ProviderHttpResult> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new ProviderError("timeout", `Timeout after ${String(timeoutMs)}ms`);
    }
    if (isRedirectRefusal(err)) {
      throw new ProviderError("redirect_refused", "Redirect refused");
    }
    throw new ProviderError("network_error", "Provider unreachable");
  }
  const latencyMs = Date.now() - started;
  const bodyText = await response.text();
  if (response.ok) {
    return { status: response.status, statusText: response.statusText, bodyText, latencyMs };
  }
  throw new ProviderError(
    categorizeStatus(response.status),
    failureMessage(response.status, response.statusText, bodyText),
    response.status
  );
}

/** Unknown-narrowing shared by every adapter's list parser. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Maps a caught adapter error to a failed key-test result.
 * Returns null when the error is not a provider failure (caller rethrows).
 * Scrubbing stays at the `apps/server` boundary — never here (Guard 11).
 */
export function toFailedTestResult(err: unknown): TestKeyResult | null {
  if (err instanceof ProviderError) {
    const result: TestKeyResult = {
      ok: false,
      category: err.category,
      message: err.message,
      ...(err.status === undefined ? {} : { status: err.status }),
    };
    return result;
  }
  return null;
}

/** Strips trailing slashes so `${base}/v1/models` never doubles them. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
