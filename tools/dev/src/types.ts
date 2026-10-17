/**
 * Shared types for the dev orchestrator (`pnpm dev`).
 *
 * Vocabulary: orchestrator (foreground owner of startup order, ports, logs,
 * readiness, supervision, teardown), namespace (per-session isolation scope),
 * run identity (liveness record for stale-state recovery).
 */

/** Log/teardown scope for one child process. */
export type ServiceName = "dev" | "server" | "web";

/** Readiness level verified before the ready message. */
export type WarmupMode = "route" | "ui";

/** Fully resolved CLI/env contract for one orchestrator run. */
export interface OrchestratorOptions {
  namespace: string;
  serverPort: number | undefined;
  webPort: number | undefined;
  warmup: WarmupMode;
}

/**
 * Typed orchestrator failure carrying the process exit code.
 *
 * Exit codes (locked at ticket 01; reconcile with spec section 7.6 at
 * ticket 03 wiring time): 0 clean shutdown, 1 generic failure (includes
 * invalid CLI/env input — no children exist yet at this layer), 2 forced
 * port in use, 3 server health gate timeout, 4 sidecar preparation timeout,
 * 5 UI warm-up failure.
 */
export class OrchestratorError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "OrchestratorError";
    this.exitCode = exitCode;
  }
}
