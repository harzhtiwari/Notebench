import { defaultSleep } from "./defaults.js";
import { OrchestratorError } from "./types.js";
import type { ServiceName } from "./types.js";

/**
 * Deadline-based readiness polling and teardown timing for the dev
 * orchestrator. Polls on a short interval (never fixed sleeps); a child
 * exit observed mid-wait aborts immediately with the failing service log
 * tail attached.
 */

/** Server health wait budget: 120 s max (spec section 8). */
export const SERVER_HEALTH_DEADLINE_MS = 120_000;
/** Sidecar listener wait budget: 35 s max (spec section 8). */
export const SIDECAR_DEADLINE_MS = 35_000;
/** Readiness poll cadence: every 150 ms (spec section 8). */
export const POLL_INTERVAL_MS = 150;
/** Teardown grace before force-kill: 10 s (spec section 8). */
export const TEARDOWN_GRACE_MS = 10_000;

/** Timeout exit code for a service readiness deadline (spec section 7.6). */
export function defaultTimeoutExitCode(service: ServiceName): number {
  if (service === "server") return 3;
  if (service === "web") return 4;
  return 1;
}

export interface ReadinessOptions {
  service: ServiceName;
  deadlineMs: number;
  intervalMs: number;
  probe: () => Promise<boolean> | boolean;
  isChildExited: () => boolean;
  getLogTail: () => Promise<string[]> | string[];
  timeoutExitCode?: number | undefined;
}

export interface ReadinessResult {
  attempts: number;
  elapsedMs: number;
}

export interface ReadinessDeps {
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

export function tailToText(tail: string[]): string {
  if (tail.length === 0) return "(no log tail captured)";
  return tail.join("\n");
}

type ProbeOutcome = "passed" | "failed" | "timeout";

/**
 * Race one probe attempt against the budget the previous attempts left, so a
 * slow probe can no longer overshoot the deadline (P18); mirrors warmup.ts's
 * per-attempt bounding for the ui gate. The winner decides the outcome and
 * the loser's late settlement is ignored either way; a rejecting probe still
 * propagates.
 */
function probeWithinBudget(
  probe: () => Promise<boolean> | boolean,
  budgetMs: number
): Promise<ProbeOutcome> {
  return new Promise<ProbeOutcome>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve("timeout");
    }, budgetMs);
    Promise.resolve()
      .then(() => probe())
      .then(
        (passed) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(passed ? "passed" : "failed");
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

/**
 * Poll `probe` every `intervalMs` until it passes or `deadlineMs` elapses.
 * The first probe runs unconditionally; every later probe is bounded by the
 * remaining budget. When the supervised child exits mid-wait, abort at once
 * (exit 1) instead of running out the clock; both failure modes name the
 * service and carry its log tail, and the timeout reports observed elapsed
 * time rather than the configured deadline.
 */
export async function waitForReadiness(
  options: ReadinessOptions,
  deps?: ReadinessDeps | undefined
): Promise<ReadinessResult> {
  const now = deps?.now ?? Date.now;
  const sleep = deps?.sleep ?? defaultSleep;
  const timeoutExitCode = options.timeoutExitCode ?? defaultTimeoutExitCode(options.service);
  const start = now();
  let attempts = 0;

  const timeoutError = async (): Promise<OrchestratorError> => {
    const elapsedMs = Math.round(now() - start);
    const tail = await options.getLogTail();
    return new OrchestratorError(
      `${options.service} readiness timed out after ${elapsedMs}ms ` +
        `(deadline ${options.deadlineMs}ms, ${attempts} attempts). Log tail:\n${tailToText(tail)}`,
      timeoutExitCode
    );
  };

  for (;;) {
    attempts += 1;
    if (options.isChildExited()) {
      const tail = await options.getLogTail();
      throw new OrchestratorError(
        `${options.service} exited while waiting for readiness ` +
          `(attempt ${attempts}). Log tail:\n${tailToText(tail)}`,
        1
      );
    }
    let passed: boolean;
    if (attempts === 1) {
      passed = await options.probe();
    } else {
      const remainingMs = options.deadlineMs - (now() - start);
      if (remainingMs <= 0) throw await timeoutError();
      const outcome = await probeWithinBudget(options.probe, remainingMs);
      if (outcome === "timeout") throw await timeoutError();
      passed = outcome === "passed";
    }
    if (passed) {
      return { attempts, elapsedMs: now() - start };
    }
    if (now() - start >= options.deadlineMs) throw await timeoutError();
    await sleep(options.intervalMs);
  }
}
