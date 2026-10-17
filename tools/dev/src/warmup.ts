import { POLL_INTERVAL_MS, tailToText, waitForReadiness } from "./readiness.js";
import { OrchestratorError } from "./types.js";
import type { WarmupMode } from "./types.js";

/**
 * Warm-up readiness levels for the dev orchestrator (ticket 07, spec 5.11).
 *
 * - `route` (default): a real request through the sidecar after preparation
 *   succeeds, with per-gate timings.
 * - `ui` (opt-in via `--warmup ui`): route readiness first, then a
 *   headless-browser probe waits for the stable app-mounted marker plus a
 *   screen control. Ready is withheld until both pass; failure exits 5 with
 *   diagnostics naming the origin, the last probe state, and the timings.
 *
 * Vocabulary: orchestrator, namespace, run identity (spec section 1).
 */

/** One verified readiness gate with its observed timing. */
export type WarmupGateName = "route-ready" | "ui-ready";

export interface WarmupGateTiming {
  name: WarmupGateName;
  elapsedMs: number;
  attempts: number;
}

/** Verified readiness level with per-gate timings. */
export interface WarmupResult {
  level: WarmupMode;
  timings: WarmupGateTiming[];
  totalElapsedMs: number;
}

/**
 * Default budget for the ui-level browser gate (confirm: spec section 8
 * assigns numeric budgets to the server-health and sidecar-listener gates
 * only; ui time is otherwise a benchmark metric, so this mirrors the
 * server-health order of magnitude to allow several per-attempt probe
 * retries instead of racing a single attempt against the 35 s sidecar wait).
 */
export const UI_WARMUP_DEADLINE_MS = 120_000;

/** Real request through the sidecar (route-ready gate). */
export type RouteProbe = () => Promise<boolean> | boolean;

/** Browser-probe observation of the running app. */
export interface UiProbeResult {
  mounted: boolean;
  screenControl: string | null;
}

/** Headless-browser probe against the web origin (marker + screen control). */
export type UiProbe = (webOrigin: string) => Promise<UiProbeResult>;

export interface VerifyWarmupOptions {
  mode: WarmupMode;
  serverOrigin: string;
  webOrigin: string;
  probeRoute: RouteProbe;
  probeUi?: UiProbe | undefined;
  deadlineMs: number;
  /** Budget for the ui gate; defaults to deadlineMs (the route/sidecar wait). */
  uiDeadlineMs?: number | undefined;
  intervalMs?: number | undefined;
}

export interface VerifyWarmupDeps {
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  isChildExited?: (() => boolean) | undefined;
  getLogTail?: (() => Promise<string[]> | string[]) | undefined;
}

function describeUiProbe(result: UiProbeResult): string {
  return `mounted=${result.mounted}, screenControl=${result.screenControl ?? "(none)"}`;
}

/**
 * Verify the requested readiness level. Route mode polls the sidecar route
 * gate; ui mode verifies the route gate first, then withholds ready until
 * the browser probe observes the mounted marker plus a screen control.
 * Route-gate timeouts carry the sidecar-preparation exit code (4, spec 7.6);
 * ui-gate failures exit 5 with the origin, last probe state, and timings.
 */
export async function verifyWarmup(
  options: VerifyWarmupOptions,
  deps?: VerifyWarmupDeps | undefined
): Promise<WarmupResult> {
  const now = deps?.now ?? Date.now;
  const sleep = deps?.sleep;
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const isChildExited = deps?.isChildExited ?? (() => false);
  const getLogTail = deps?.getLogTail ?? (async () => [] as string[]);
  const sleepOpts = sleep === undefined ? {} : { sleep };

  const start = now();
  const route = await waitForReadiness(
    {
      service: "web",
      deadlineMs: options.deadlineMs,
      intervalMs,
      probe: options.probeRoute,
      isChildExited,
      getLogTail,
    },
    { now, ...sleepOpts }
  );
  const timings: WarmupGateTiming[] = [
    { name: "route-ready", elapsedMs: route.elapsedMs, attempts: route.attempts },
  ];

  if (options.mode === "route") {
    return { level: "route", timings, totalElapsedMs: now() - start };
  }

  const probeUi = options.probeUi;
  if (probeUi === undefined) {
    throw new OrchestratorError(
      `UI warm-up requested for ${options.webOrigin} but no browser probe is wired: ` +
        `refusing to report ui-ready without the mounted marker.`,
      1
    );
  }

  const uiStart = now();
  const uiDeadlineMs = options.uiDeadlineMs ?? options.deadlineMs;
  let attempts = 0;
  let last: UiProbeResult = { mounted: false, screenControl: null };
  let lastProbeError: string | null = null;
  for (;;) {
    attempts += 1;
    if (isChildExited()) {
      const tail = await getLogTail();
      const tailText = tailToText(tail);
      throw new OrchestratorError(
        `web exited while waiting for UI warm-up (attempt ${attempts}). Log tail:\n${tailText}`,
        1
      );
    }
    try {
      last = await probeUi(options.webOrigin);
      lastProbeError = null;
    } catch (error: unknown) {
      lastProbeError = error instanceof Error ? error.message : String(error);
    }
    if (lastProbeError === null && last.mounted && last.screenControl !== null) {
      timings.push({ name: "ui-ready", elapsedMs: now() - uiStart, attempts });
      return { level: "ui", timings, totalElapsedMs: now() - start };
    }
    if (now() - uiStart >= uiDeadlineMs) {
      const uiElapsedMs = now() - uiStart;
      timings.push({ name: "ui-ready", elapsedMs: uiElapsedMs, attempts });
      const probeState =
        lastProbeError === null
          ? `Last probe: ${describeUiProbe(last)}.`
          : `Last probe error: ${lastProbeError}. Last state: ${describeUiProbe(last)}.`;
      throw new OrchestratorError(
        `UI warm-up failed for ${options.webOrigin}: app-mounted marker and screen control ` +
          `not observed within ${uiDeadlineMs}ms (${attempts} attempts). ` +
          `${probeState} ` +
          `Timings: routeReadyMs=${timings[0]?.elapsedMs ?? 0}, uiReadyMs=${uiElapsedMs}.`,
        5
      );
    }
    if (sleep !== undefined) {
      await sleep(intervalMs);
    } else {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
  }
}

export interface ReadyLineInput {
  namespace: string;
  serverOrigin: string;
  webOrigin: string;
  result: WarmupResult;
}

/**
 * Render the ready message: both origins, the verified level, and per-gate
 * timings. Listening and UI-warmed are never conflated: the level names
 * exactly what was verified, and ui timings appear only on ui-level lines.
 */
export function formatReadyLine(input: ReadyLineInput): string {
  const parts: string[] = [
    `[dev] ready namespace=${input.namespace}`,
    `level=${input.result.level}`,
    `serverOrigin=${input.serverOrigin}`,
    `webOrigin=${input.webOrigin}`,
  ];
  for (const timing of input.result.timings) {
    if (timing.name === "route-ready") {
      parts.push(`routeReadyMs=${timing.elapsedMs}`);
    } else if (timing.name === "ui-ready") {
      parts.push(`uiReadyMs=${timing.elapsedMs}`);
    }
  }
  parts.push(`totalMs=${input.result.totalElapsedMs}`);
  return parts.join(" ");
}
