import { randomUUID } from "node:crypto";
import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rm as fsRm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrchestratorArgs } from "./args.js";
import { resolveRunPaths } from "./paths.js";
import type { RunPaths } from "./paths.js";
import { allocateRunPorts } from "./ports.js";
import { spawnChild } from "./spawn.js";
import type { SpawnedChild, SpawnFn } from "./spawn.js";
import {
  createServiceLogTee,
  formatStartupLine,
  readLogTail,
  rotateNamespaceLogs,
} from "./logs.js";
import {
  POLL_INTERVAL_MS,
  SERVER_HEALTH_DEADLINE_MS,
  SIDECAR_DEADLINE_MS,
  TEARDOWN_GRACE_MS,
  waitForReadiness,
} from "./readiness.js";
import { createOsPidLivenessChecker } from "./process-start-time.js";
import type { PidLiveness, RunIdentity } from "./identity.js";
import {
  currentProcessStartTimeMs,
  isIdentityLive,
  readIdentity,
  writeIdentity,
} from "./identity.js";
import { teardownOwnedRun } from "./cleanup.js";
import type { OwnedChild } from "./cleanup.js";
import { ensureServerFreshness } from "./freshness.js";
import type { CompiledDep } from "./freshness.js";
import { formatReadyLine, UI_WARMUP_DEADLINE_MS, verifyWarmup } from "./warmup.js";
import type { UiProbe, UiProbeResult, WarmupResult } from "./warmup.js";
import { probeAppMounted } from "./warmup-browser.js";
import { resolveGeneratedPathsForRun } from "./isolate.js";
import {
  SERVER_ORIGIN_ENV,
  WEB_DEV_BUNDLER_ENV,
  WEB_DEV_BUNDLER_ENV_ALIAS,
  WEB_DIST_DIR_ENV,
} from "./config-duality.js";
import type { WebDevBundler } from "./config-duality.js";
import type { ChildExit } from "./spawn.js";
import { OrchestratorError } from "./types.js";

/**
 * Backend startup end-to-end for the dev orchestrator (ticket 03) with the
 * web sidecar phase under the same supervision (ticket 04).
 *
 * Sequence: parse args → stale recovery (identity-verified, never blind PID
 * reuse) → freshness gates (server-consumed compiled outputs only, never the
 * web production export) → allocate ports → spawn the server from source
 * with HOST/PORT passthrough → gate on the real health endpoint → publish
 * namespaced port/PID/identity records → install reverse-order teardown.
 *
 * With a web-phase starter wired (ticket 04: `runDevCommand` wires the
 * default sidecar starter), the server-ready sequencing hook starts the
 * sidecar from source, gates on a real route through it, extends the same
 * records, and joins the same reverse-order supervision: any unexpected
 * child exit stops the sibling and exits non-zero.
 */

export const ORCHESTRATOR_HOST = "127.0.0.1";
export const SERVER_HEALTH_PATH = "/healthz";
/** Orchestrator-provided absolute server port-file path (canonical + alias). */
export const SERVER_PORT_FILE_ENV = "NOTEBENCH_SERVER_PORT_FILE";
export const SERVER_PORT_FILE_ENV_ALIAS = "NB_SERVER_PORT_FILE";
export const DEV_RUN_ID_ENV = "NOTEBENCH_DEV_RUN_ID";

export interface ServerSpawnRequest {
  executable: string;
  argv: string[];
}

export interface ServerSpawnContext {
  host: string;
  port: number;
  portFile: string;
  entry: string;
}

interface WebSpawnRequest {
  executable: string;
  argv: string[];
}

interface WebSpawnContext {
  host: string;
  port: number;
  serverOrigin: string;
  distDir: string;
  bundler: WebDevBundler;
  webDir: string;
}

/** A started web sidecar child: enough to supervise, gate, and record it. */
interface WebStarted {
  pid: number;
  startTimeMs: number;
  exited: Promise<ChildExit>;
  logFile: string;
  port: number;
  flush?: (() => Promise<void>) | undefined;
}

export interface ServerReadyTimings {
  healthAttempts: number;
  healthElapsedMs: number;
}

export interface ServerReadyContext {
  root: string;
  namespace: string;
  runId: string;
  host: string;
  serverPort: number;
  reservedWebPort: number;
  paths: RunPaths;
  serverChild: SpawnedChild;
  timings: ServerReadyTimings;
  /**
   * True once any supervised child exited, shutdown began, or the run
   * settled; the web gate aborts on it so a server crash mid-gate cannot
   * run out the gate's deadline.
   */
  isRunOver: () => boolean;
}

export interface BackendHandle {
  root: string;
  namespace: string;
  runId: string;
  host: string;
  serverPort: number;
  paths: RunPaths;
  serverChild: SpawnedChild;
  shutdown: () => Promise<number>;
  waitForExit: () => Promise<number>;
}

export interface BackendPhaseOptions {
  root?: string | undefined;
  argv?: string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
}

export interface BackendPhaseDeps {
  now?: (() => number) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  spawnFn?: SpawnFn | undefined;
  isPidLive?: PidLiveness | undefined;
  createServerSpawn?: ((ctx: ServerSpawnContext) => ServerSpawnRequest) | undefined;
  serverEntryPath?: string | undefined;
  healthPath?: string | undefined;
  serverDeadlineMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  probeHealth?: ((url: string) => Promise<boolean>) | undefined;
  onSignal?: ((signal: string, handler: () => void) => void) | undefined;
  removeSignal?: ((signal: string, handler: () => void) => void) | undefined;
  onServerReady?: ((ctx: ServerReadyContext) => Promise<void> | void) | undefined;
  randomRunId?: (() => string) | undefined;
  logLine?: ((line: string) => void) | undefined;
  runBuild?: ((dep: CompiledDep) => Promise<void> | void) | undefined;
  statMtimeMs?: ((path: string) => Promise<number | null>) | undefined;
  listFilesRecursive?: ((dir: string) => Promise<string[]>) | undefined;
  createWebSpawn?: ((ctx: WebSpawnContext) => WebSpawnRequest) | undefined;
  webDeadlineMs?: number | undefined;
  probeWeb?: ((url: string) => Promise<boolean>) | undefined;
  /**
   * Web-phase starter, invoked after the server health gate passes. Absent
   * means backend-only (ticket 03 behavior); `runDevCommand` wires the
   * default sidecar starter.
   */
  startWebPhase?: ((ctx: ServerReadyContext) => Promise<WebStarted>) | undefined;
  /**
   * Browser probe for `--warmup ui`: observes the app-mounted marker plus a
   * screen control at the web origin. Absent means the real headless probe;
   * tests inject a fake. Invoked only in ui mode, never for route level.
   */
  probeUi?: UiProbe | undefined;
  /** Deadline per warmup gate (default 35 s, spec section 8 sidecar wait). */
  warmupDeadlineMs?: number | undefined;
  /**
   * Budget for the ui-level browser gate (default 120 s). Kept separate from
   * the route/sidecar wait so the browser probe can retry several per-attempt
   * timeouts instead of racing a single 30 s attempt against the 35 s gate.
   */
  warmupUiDeadlineMs?: number | undefined;
  /**
   * Benchmark hook (ticket 08): invoked with the verified warmup result
   * after the ready line is logged. Absent in normal runs.
   */
  onWarmup?: ((result: WarmupResult) => Promise<void> | void) | undefined;
}

function defaultLogLine(line: string): void {
  console.log(line);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function defaultProbeHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

function defaultOnSignal(signal: string, handler: () => void): void {
  process.on(signal, handler);
}

function defaultRemoveSignal(signal: string, handler: () => void): void {
  if (typeof process.off === "function") {
    process.off(signal, handler);
  }
}

function defaultCreateServerSpawn(ctx: ServerSpawnContext): ServerSpawnRequest {
  return { executable: process.execPath, argv: ["--import", resolveTsxLoader(), ctx.entry] };
}

/**
 * Resolve the TypeScript executor loader to an absolute URL at composer
 * time, so the server child boots from source regardless of its own cwd
 * (bare specifiers would resolve against the child cwd, which is the
 * disposable state root in tests).
 */
function resolveTsxLoader(): string {
  try {
    return import.meta.resolve("tsx/esm");
  } catch {
    return "tsx/esm";
  }
}

/** Checkout root derived from this module (source lives here, not under state). */
function resolveRepoRoot(): string {
  return dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
}

async function defaultProbeWeb(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

/** Real headless-browser probe for `--warmup ui` (lazy browser load). */
function defaultProbeUi(webOrigin: string): Promise<UiProbeResult> {
  return probeAppMounted(webOrigin, { timeoutMs: 30_000 });
}

/**
 * CLI cutover (open-design parity): the web child is the real `next dev`
 * CLI, so the genuine Next.js startup block, HMR, and compile output come
 * from Next itself. The API split moved to the web config's sidecar
 * rewrites; supervision and readiness gating are unchanged.
 */
export function resolveNextBin(webDir: string): string {
  return join(webDir, "node_modules", "next", "dist", "bin", "next");
}

export interface NextDevArgv {
  nextBin: string;
  webDir: string;
  host: string;
  port: number;
  bundler: WebDevBundler;
}

export function buildNextDevArgv(request: NextDevArgv): string[] {
  return [
    request.nextBin,
    "dev",
    request.webDir,
    "-H",
    request.host,
    "-p",
    String(request.port),
    request.bundler === "turbopack" ? "--turbopack" : "--webpack",
  ];
}

function defaultCreateWebSpawn(ctx: WebSpawnContext): WebSpawnRequest {
  const nextBin = resolveNextBin(ctx.webDir);
  return {
    executable: process.execPath,
    argv: buildNextDevArgv({
      nextBin,
      webDir: ctx.webDir,
      host: ctx.host,
      port: ctx.port,
      bundler: ctx.bundler,
    }),
  };
}

export function resolveWebBundler(env: Record<string, string | undefined>): WebDevBundler {
  const raw =
    env[WEB_DEV_BUNDLER_ENV] ?? env[WEB_DEV_BUNDLER_ENV_ALIAS] ?? "turbopack";
  if (raw !== "webpack" && raw !== "turbopack") {
    throw new OrchestratorError(
      `Unknown sidecar bundler "${raw}": expected "webpack" or "turbopack".`,
      1
    );
  }
  return raw;
}

/**
 * Default web-phase starter: spawn the sidecar child from source with the
 * orchestrator-owned env, gate on a real route through it (route-ready),
 * and hand back supervision records. The gate also aborts when the run is
 * already over (any supervised child exited, shutdown began, or the run
 * settled), so a server crash mid-gate fails with the run-over cause
 * instead of running out the web deadline. On gate failure the starter
 * stops its own child before throwing; this partial teardown (web only)
 * never removes the server's records or `identity.json` — identity is
 * removed only when the server (run owner) is in the children list. The
 * backend catch path then tears down the server; overlapping teardown
 * passes stay safe because each pass touches only the records of the
 * children it stops.
 */
export async function startDefaultWebPhase(
  ctx: ServerReadyContext,
  deps?: BackendPhaseDeps | undefined,
  env?: Record<string, string | undefined> | undefined
): Promise<WebStarted> {
  const runEnv = env ?? process.env;
  const logLine = deps?.logLine ?? defaultLogLine;
  const sleep = deps?.sleep ?? defaultSleep;
  const probeWeb = deps?.probeWeb ?? defaultProbeWeb;
  const createWebSpawn = deps?.createWebSpawn ?? defaultCreateWebSpawn;
  const webDeadlineMs = deps?.webDeadlineMs ?? SIDECAR_DEADLINE_MS;
  const pollIntervalMs = deps?.pollIntervalMs ?? POLL_INTERVAL_MS;
  const isPidLive: PidLiveness = deps?.isPidLive ?? createOsPidLivenessChecker();

  const generated = resolveGeneratedPathsForRun(ctx.paths);
  const webDir = join(ctx.root, "apps", "web");
  const bundler = resolveWebBundler(runEnv);
  const serverOrigin = `http://${ctx.host}:${ctx.serverPort}`;
  const port = ctx.reservedWebPort;

  await fsMkdir(generated.buildDir, { recursive: true });
  await fsMkdir(dirname(ctx.paths.webLogFile), { recursive: true });
  await rotateNamespaceLogs({
    latestFile: ctx.paths.webLogFile,
    previousFile: join(dirname(ctx.paths.webLogFile), "previous.log"),
  });

  const spawnRequest = createWebSpawn({
    host: ctx.host,
    port,
    serverOrigin,
    distDir: generated.distDir,
    bundler,
    webDir,
  });

  logLine(
    formatStartupLine("web", {
      service: "web",
      namespace: ctx.namespace,
      runId: ctx.runId,
      host: ctx.host,
      webPort: port,
      executable: spawnRequest.executable,
      logFile: ctx.paths.webLogFile,
    })
  );

  const tee = createServiceLogTee({
    logFile: ctx.paths.webLogFile,
    service: "web",
    logLine,
  });

  const childEnv: Record<string, string | undefined> = {
    ...runEnv,
    HOST: ctx.host,
    PORT: String(port),
    [SERVER_ORIGIN_ENV]: serverOrigin,
    [WEB_DIST_DIR_ENV]: generated.distDir,
    [WEB_DEV_BUNDLER_ENV]: bundler,
    [DEV_RUN_ID_ENV]: ctx.runId,
  };

  const webChild: SpawnedChild = spawnChild(
    {
      executable: spawnRequest.executable,
      argv: spawnRequest.argv,
      service: "web",
      namespace: ctx.namespace,
      runId: ctx.runId,
      logFile: ctx.paths.webLogFile,
      cwd: ctx.root,
      env: childEnv,
      onOutput: tee.onOutput,
    },
    { spawnFn: deps?.spawnFn, now: deps?.now ?? Date.now }
  );

  let webExited = false;
  void webChild.exited.then(() => {
    webExited = true;
  });

  const webUrl = `http://${ctx.host}:${port}/`;
  try {
    await waitForReadiness(
      {
        service: "web",
        deadlineMs: webDeadlineMs,
        intervalMs: pollIntervalMs,
        probe: () => probeWeb(webUrl),
        isChildExited: () => webExited || ctx.isRunOver(),
        getLogTail: () => readFailureTail(ctx.paths.webLogFile, sleep),
      },
      { now: deps?.now ?? Date.now, sleep }
    );
    await tee.flush();
  } catch (error: unknown) {
    await teardownOwnedRun(
      ctx.paths,
      [{ service: "web", pid: webChild.pid, startTimeMs: webChild.startTimeMs }],
      { isPidLive }
    );
    if (ctx.isRunOver()) {
      throw new OrchestratorError("server exited while the web sidecar was starting", 1);
    }
    throw error;
  }

  return {
    pid: webChild.pid,
    startTimeMs: webChild.startTimeMs,
    exited: webChild.exited,
    logFile: ctx.paths.webLogFile,
    port,
    flush: tee.flush,
  };
}

/** Nested port-file residue from the pre-orchestrator era (never namespaced). */
export function nestedServerPortResidue(root: string): string {
  return join(root, "apps", "server", ".tmp", "ports", "server.port");
}

async function ignoreMissing(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch {
    // Idempotent cleanup: missing files are fine.
  }
}

/**
 * First-run recovery: a live identity fails fast naming the occupant; any
 * other state (stale, corrupt, or missing identity) is cleaned by removal
 * only — no signal is ever sent to an unverified PID.
 */
async function recoverStaleRun(paths: RunPaths, isPidLive: PidLiveness): Promise<void> {
  const previous = await readIdentity(paths.identityFile);
  if (previous !== null && (await isIdentityLive(previous, isPidLive))) {
    throw new OrchestratorError(
      `Namespace "${paths.namespace}" is already running ` +
        `(orchestrator pid ${previous.orchestratorPid}, run "${previous.runId}"). ` +
        `Stop that run before starting a new one.`,
      1
    );
  }
  const ownedRecords = [
    paths.serverPortFile,
    paths.webPortFile,
    paths.serverPidFile,
    paths.webPidFile,
    paths.identityFile,
  ];
  for (const file of ownedRecords) {
    await ignoreMissing(fsRm(file, { force: true }));
  }
  await ignoreMissing(fsRm(nestedServerPortResidue(paths.root), { force: true }));
}

/** Read the failure tail, waiting briefly for piped output to flush. */
async function readFailureTail(
  logFile: string,
  sleep: (ms: number) => Promise<void>
): Promise<string[]> {
  let previous = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let content = "";
    try {
      content = await fsReadFile(logFile, "utf-8");
    } catch {
      content = "";
    }
    if (content !== "" && content === previous) {
      const lines = content.split(/\r?\n/);
      const last: string | undefined = lines[lines.length - 1];
      const trimmed = last === "" ? lines.slice(0, -1) : lines;
      return trimmed.slice(Math.max(0, trimmed.length - 80));
    }
    previous = content;
    await sleep(50);
  }
  try {
    return await readLogTail(logFile);
  } catch {
    return [];
  }
}

export async function startBackendPhase(
  options?: BackendPhaseOptions | undefined,
  deps?: BackendPhaseDeps | undefined
): Promise<BackendHandle> {
  const env = options?.env ?? process.env;
  const argv = options?.argv ?? process.argv.slice(2);
  const now = deps?.now ?? Date.now;
  const sleep = deps?.sleep ?? defaultSleep;
  const logLine = deps?.logLine ?? defaultLogLine;
  const probeHealth = deps?.probeHealth ?? defaultProbeHealth;
  const onSignal = deps?.onSignal ?? defaultOnSignal;
  const removeSignal = deps?.removeSignal ?? defaultRemoveSignal;
  const createServerSpawn = deps?.createServerSpawn ?? defaultCreateServerSpawn;
  const healthPath = deps?.healthPath ?? SERVER_HEALTH_PATH;
  const serverDeadlineMs = deps?.serverDeadlineMs ?? SERVER_HEALTH_DEADLINE_MS;
  const pollIntervalMs = deps?.pollIntervalMs ?? POLL_INTERVAL_MS;
  const runId = deps?.randomRunId?.() ?? randomUUID();

  const parsed = parseOrchestratorArgs(argv, env);
  const root = options?.root ?? process.cwd();
  if (!isAbsolute(root)) {
    throw new OrchestratorError(`Invalid workspace root "${root}": must be an absolute path.`, 1);
  }
  const paths = resolveRunPaths(root, parsed.namespace);
  const host = ORCHESTRATOR_HOST;
  const isPidLive: PidLiveness = deps?.isPidLive ?? createOsPidLivenessChecker();

  await recoverStaleRun(paths, isPidLive);

  await ensureServerFreshness(root, {
    runBuild: deps?.runBuild,
    statMtimeMs: deps?.statMtimeMs,
    listFilesRecursive: deps?.listFilesRecursive,
  });

  const allocated = await allocateRunPorts({
    serverPort: parsed.serverPort,
    webPort: parsed.webPort,
    host,
  });

  await fsMkdir(paths.portsDir, { recursive: true });
  await fsMkdir(paths.pidsDir, { recursive: true });
  await fsMkdir(paths.runDir, { recursive: true });
  await fsMkdir(dirname(paths.serverLogFile), { recursive: true });
  await rotateNamespaceLogs({
    latestFile: paths.serverLogFile,
    previousFile: join(dirname(paths.serverLogFile), "previous.log"),
  });

  const serverEntry = deps?.serverEntryPath ?? join(resolveRepoRoot(), "apps", "server", "src", "index.ts");
  const spawnRequest = createServerSpawn({
    host,
    port: allocated.serverPort,
    portFile: paths.serverPortFile,
    entry: serverEntry,
  });

  logLine(
    formatStartupLine("server", {
      service: "server",
      namespace: paths.namespace,
      runId,
      host,
      serverPort: allocated.serverPort,
      executable: spawnRequest.executable,
      logFile: paths.serverLogFile,
    })
  );

  const serviceTee = createServiceLogTee({
    logFile: paths.serverLogFile,
    service: "server",
    logLine,
  });
  const flushOutput = serviceTee.flush;

  const childEnv: Record<string, string | undefined> = {
    ...env,
    HOST: host,
    PORT: String(allocated.serverPort),
    [SERVER_PORT_FILE_ENV]: paths.serverPortFile,
    [DEV_RUN_ID_ENV]: runId,
  };

  let serverChild: SpawnedChild;
  try {
    serverChild = spawnChild(
      {
        executable: spawnRequest.executable,
        argv: spawnRequest.argv,
        service: "server",
        namespace: paths.namespace,
        runId,
        logFile: paths.serverLogFile,
        cwd: root,
        env: childEnv,
        onOutput: serviceTee.onOutput,
      },
      { spawnFn: deps?.spawnFn, now }
    );
  } catch (error: unknown) {
    await teardownOwnedRun(paths, [], { isPidLive });
    throw error;
  }

  const orchestratorStartTimeMs = currentProcessStartTimeMs(now(), process.uptime());
  const identityRecord: RunIdentity = {
    runId,
    namespace: paths.namespace,
    orchestratorPid: process.pid,
    orchestratorStartTimeMs,
    children: {
      server: { pid: serverChild.pid, startTimeMs: serverChild.startTimeMs },
    },
    createdAt: new Date().toISOString(),
  };
  await writeIdentity(paths.identityFile, identityRecord);
  await fsWriteFile(paths.serverPidFile, `${serverChild.pid}\n`, "utf-8");

  const ownedServer: OwnedChild = {
    service: "server",
    pid: serverChild.pid,
    startTimeMs: serverChild.startTimeMs,
  };
  // Supervised children in start order; teardown reverses it (web before
  // server). The web phase appends once the sidecar is gated.
  const owned: OwnedChild[] = [ownedServer];
  // Exit promises in the same order. Shutdown returns only after every
  // owned child is actually reaped (not merely signaled): reaping is what
  // releases OS locks such as the Windows working-directory handle, so
  // post-run cleanup never races a dying child.
  const exitPromises: Array<Promise<ChildExit>> = [serverChild.exited];
  let childExited = false;
  let shuttingDown = false;
  let settled = false;
  let settledCode = 0;
  let resolveExit: (code: number) => void = () => undefined;
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  const finish = (code: number): void => {
    if (!settled) {
      settled = true;
      settledCode = code;
      resolveExit(code);
    }
  };
  const isRunOver = (): boolean => childExited || shuttingDown || settled;

  const shutdown = async (): Promise<number> => {
    if (settled) return settledCode;
    shuttingDown = true;
    removeSignal("SIGINT", handleSigint);
    removeSignal("SIGTERM", handleSigterm);
    await teardownOwnedRun(paths, owned, { isPidLive });
    await flushOutput();
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reaped = await Promise.race([
        Promise.allSettled(exitPromises).then(() => true),
        new Promise<false>((resolve) => {
          settleTimer = setTimeout(() => resolve(false), TEARDOWN_GRACE_MS);
        }),
      ]);
      if (!reaped) {
        logLine(`[dev] shutdown proceeding with owned children still attached after ${String(TEARDOWN_GRACE_MS)}ms`);
      }
    } finally {
      if (settleTimer !== undefined) clearTimeout(settleTimer);
    }
    finish(0);
    return settledCode;
  };

  function handleSigint(): void {
    void shutdown();
  }

  function handleSigterm(): void {
    void shutdown();
  }

  void serverChild.exited.then(async () => {
    childExited = true;
    if (shuttingDown || settled) return;
    await flushOutput();
    const tail = await readFailureTail(paths.serverLogFile, sleep);
    const tailText = tail.length > 0 ? tail.join("\n") : "(no log tail captured)";
    logLine(`[server] exited unexpectedly. Log tail:\n${tailText}`);
    await teardownOwnedRun(paths, owned, { isPidLive });
    finish(1);
  });

  const healthUrl = `http://${host}:${allocated.serverPort}${healthPath}`;
  try {
    const ready = await waitForReadiness(
      {
        service: "server",
        deadlineMs: serverDeadlineMs,
        intervalMs: pollIntervalMs,
        probe: () => probeHealth(healthUrl),
        isChildExited: () => childExited,
        getLogTail: () => readFailureTail(paths.serverLogFile, sleep),
      },
      { now, sleep }
    );
    await flushOutput();
    await fsWriteFile(paths.serverPortFile, `${allocated.serverPort}\n`, "utf-8");

    // Shutdown handlers must exist before any readiness record is
    // observable: observers signal as soon as they see the record, and a
    // signal delivered before registration would be silently dropped.
    onSignal("SIGINT", handleSigint);
    onSignal("SIGTERM", handleSigterm);

    const hook = deps?.onServerReady;
    const readyCtx: ServerReadyContext = {
      root,
      namespace: paths.namespace,
      runId,
      host,
      serverPort: allocated.serverPort,
      reservedWebPort: allocated.webPort,
      paths,
      serverChild,
      timings: { healthAttempts: ready.attempts, healthElapsedMs: ready.elapsedMs },
      isRunOver,
    };
    if (hook !== undefined) {
      await hook(readyCtx);
    }

    logLine(
      `[dev] backend ready namespace=${paths.namespace} ` +
        `serverPort=${allocated.serverPort} healthAttempts=${ready.attempts} ` +
        `healthElapsedMs=${ready.elapsedMs}`
    );

    const startWebPhase = deps?.startWebPhase;
    if (startWebPhase !== undefined) {
      const web = await startWebPhase(readyCtx);
      const ownedWeb: OwnedChild = {
        service: "web",
        pid: web.pid,
        startTimeMs: web.startTimeMs,
      };
      owned.push(ownedWeb);
      exitPromises.push(web.exited);
      if (isRunOver()) {
        throw new OrchestratorError("server exited while the web sidecar was starting", 1);
      }
      await fsWriteFile(paths.webPortFile, `${web.port}\n`, "utf-8");
      await fsWriteFile(paths.webPidFile, `${web.pid}\n`, "utf-8");
      identityRecord.children["web"] = { pid: web.pid, startTimeMs: web.startTimeMs };
      await writeIdentity(paths.identityFile, identityRecord);
      void web.exited.then(async () => {
        if (shuttingDown || settled) return;
        if (web.flush !== undefined) await web.flush();
        const tail = await readFailureTail(web.logFile, sleep);
        const tailText = tail.length > 0 ? tail.join("\n") : "(no log tail captured)";
        logLine(`[web] exited unexpectedly. Log tail:\n${tailText}`);
        await teardownOwnedRun(paths, owned, { isPidLive });
        finish(1);
      });
      logLine(
        `[dev] web listening namespace=${paths.namespace} webPort=${web.port} ` +
          `serverPort=${allocated.serverPort}`
      );
      const serverOrigin = `http://${host}:${allocated.serverPort}`;
      const webOrigin = `http://${host}:${web.port}`;
      const probeWebRoute = deps?.probeWeb ?? defaultProbeWeb;
      const warmup = await verifyWarmup(
        {
          mode: parsed.warmup,
          serverOrigin,
          webOrigin,
          probeRoute: () => probeWebRoute(`${webOrigin}/`),
          probeUi: deps?.probeUi ?? defaultProbeUi,
          deadlineMs: deps?.warmupDeadlineMs ?? SIDECAR_DEADLINE_MS,
          uiDeadlineMs: deps?.warmupUiDeadlineMs ?? UI_WARMUP_DEADLINE_MS,
          intervalMs: pollIntervalMs,
        },
        {
          now,
          sleep,
          isChildExited: () => settled,
          getLogTail: () => readFailureTail(paths.webLogFile, sleep),
        }
      );
      logLine(
        formatReadyLine({ namespace: paths.namespace, serverOrigin, webOrigin, result: warmup })
      );
      const onWarmup = deps?.onWarmup;
      if (onWarmup !== undefined) {
        await onWarmup(warmup);
      }
    }
  } catch (error: unknown) {
    await flushOutput();
    await teardownOwnedRun(paths, owned, { isPidLive });
    finish(error instanceof OrchestratorError ? error.exitCode : 1);
    throw error;
  }

  return {
    root,
    namespace: paths.namespace,
    runId,
    host,
    serverPort: allocated.serverPort,
    paths,
    serverChild,
    shutdown,
    waitForExit: () => exitPromise,
  };
}

/**
 * CLI wrapper: run the full dev run (backend first, then the web sidecar)
 * until shutdown or child exit, returning the process exit code. Never
 * throws; failures are logged with the failing service and its log tail
 * (carried on the error message). An explicitly injected `startWebPhase`
 * wins over the default sidecar starter.
 */
export async function runDevCommand(
  options?: BackendPhaseOptions | undefined,
  deps?: BackendPhaseDeps | undefined
): Promise<number> {
  const logLine = deps?.logLine ?? defaultLogLine;
  try {
    const startWebPhase =
      deps?.startWebPhase ?? ((ctx: ServerReadyContext) => startDefaultWebPhase(ctx, deps, options?.env));
    const handle = await startBackendPhase(options, { ...deps, startWebPhase });
    return await handle.waitForExit();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(`[dev] run failed: ${message}`);
    if (error instanceof OrchestratorError) return error.exitCode;
    return 1;
  }
}

/**
 * CLI wrapper: run the backend phase until shutdown or child exit, returning
 * the process exit code. Never throws; failures are logged with the failing
 * service and its log tail (carried on the error message).
 */
export async function runBackendCommand(
  options?: BackendPhaseOptions | undefined,
  deps?: BackendPhaseDeps | undefined
): Promise<number> {
  const logLine = deps?.logLine ?? defaultLogLine;
  try {
    const handle = await startBackendPhase(options, deps);
    return await handle.waitForExit();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(`[dev] backend failed: ${message}`);
    if (error instanceof OrchestratorError) return error.exitCode;
    return 1;
  }
}
