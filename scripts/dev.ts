import "dotenv/config";
import { spawn, execSync, ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, renameSync, appendFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import getPort, { portNumbers } from "get-port";

export interface DevPortOptions {
  preferredWebPort?: number | undefined;
  preferredServerPort?: number | undefined;
  host?: string | undefined;
}

export interface AllocatedPorts {
  webPort: number;
  serverPort: number;
}

export interface DevRunState {
  webPort?: number | undefined;
  serverPort?: number | undefined;
  webPid?: number | undefined;
  serverPid?: number | undefined;
}

export interface StartDevOptions {
  root?: string | undefined;
  preferredWebPort?: number | undefined;
  preferredServerPort?: number | undefined;
  spawnFn?: typeof spawn | undefined;
  /** When false, skip the Next.js web compiler entirely (serve the prebuilt pack from the daemon). Default true. */
  web?: boolean | undefined;
}

export interface StartDevResult {
  webPort?: number | undefined;
  serverPort: number;
  serverProcess: ChildProcess;
  webProcess?: ChildProcess | undefined;
  shutdown: (code?: number) => void;
}

/**
 * Parses `pnpm dev` CLI flags. Only known flag today is `--no-web`.
 */
export function parseDevArgs(argv: string[]): { web: boolean } {
  return { web: !argv.includes("--no-web") };
}

/**
 * Checks whether a specific port is available for listening on the given host using node:net.
 */
export async function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolveResult) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => {
      resolveResult(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolveResult(true);
      });
    });

    try {
      server.listen(port, host);
    } catch {
      resolveResult(false);
    }
  });
}

/**
 * Dynamically finds an open port starting at the given port on the given host using node:net.
 */
export async function findAvailablePort(startPort: number, host = "127.0.0.1", maxAttempts = 100): Promise<number> {
  // First attempt getPort with portNumbers range for fast probing
  try {
    const candidate = await getPort({
      port: portNumbers(startPort, startPort + maxAttempts),
      host,
    });
    if (await isPortAvailable(candidate, host)) {
      return candidate;
    }
  } catch {
    // Fall back to sequential search using node:net
  }

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port starting at ${startPort} within ${maxAttempts} attempts on ${host}`);
}

/**
 * Dynamically allocates distinct ports for web and server, starting at 3000 (web) and 3001 (server).
 */
export async function allocateDevPorts(options: DevPortOptions = {}): Promise<AllocatedPorts> {
  const host = options.host ?? "127.0.0.1";
  const preferredWeb = options.preferredWebPort ?? (
    process.env["WEB_PORT"] ? Number(process.env["WEB_PORT"]) : (process.env["PORT"] ? Number(process.env["PORT"]) : 3000)
  );
  const preferredServer = options.preferredServerPort ?? (
    process.env["SERVER_PORT"] ? Number(process.env["SERVER_PORT"]) : 3001
  );

  const webPort = await findAvailablePort(preferredWeb, host);

  // If server would collide with webPort, probe starting from max(preferredServer, webPort + 1)
  let serverStart = preferredServer;
  if (serverStart === webPort) {
    serverStart = webPort + 1;
  }

  let serverPort = await findAvailablePort(serverStart, host);
  while (serverPort === webPort) {
    serverPort = await findAvailablePort(serverPort + 1, host);
  }

  return { webPort, serverPort };
}

/**
 * Scaffolds the Two-Folder Taxonomy filesystem layout across .notebook/ (persistent) and .tmp/ (ephemeral).
 */
export function ensureStorageLayout(root: string): void {
  // Persistent application state (ADR 0004 / AGENTS.md Rule 1)
  const persistentDirs = [
    join(root, ".notebook", "db"),
    join(root, ".notebook", "uploads"),
    join(root, ".notebook", "artifacts"),
    join(root, ".notebook", "runs"),
    join(root, ".notebook", "vault"),
  ];

  // Ephemeral caches and runtime directories (ADR 0004 / AGENTS.md Rule 1)
  const ephemeralDirs = [
    join(root, ".tmp", "cache"),
    join(root, ".tmp", "logs"),
    join(root, ".tmp", "logs", "dev"),
    join(root, ".tmp", "logs", "server"),
    join(root, ".tmp", "logs", "web"),
    join(root, ".tmp", "reports"),
    join(root, ".tmp", "scratch"),
    join(root, ".tmp", "ports"),
    join(root, ".tmp", "pids"),
  ];

  for (const dir of [...persistentDirs, ...ephemeralDirs]) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Records active development ports and PIDs into .tmp/ports/ and .tmp/pids/.
 */
export function writeDevRunState(root: string, state: DevRunState): void {
  const portsDir = join(root, ".tmp", "ports");
  const pidsDir = join(root, ".tmp", "pids");

  mkdirSync(portsDir, { recursive: true });
  mkdirSync(pidsDir, { recursive: true });

  if (state.webPort !== undefined) {
    writeFileSync(join(portsDir, "web.port"), String(state.webPort), "utf-8");
  }

  if (state.serverPort !== undefined) {
    writeFileSync(join(portsDir, "server.port"), String(state.serverPort), "utf-8");
  }

  if (state.webPid !== undefined) {
    writeFileSync(join(pidsDir, "web.pid"), String(state.webPid), "utf-8");
  }

  if (state.serverPid !== undefined) {
    writeFileSync(join(pidsDir, "server.pid"), String(state.serverPid), "utf-8");
  }
}

/**
 * Cleans up ephemeral port and PID files from .tmp/ports/ and .tmp/pids/.
 */
export function cleanDevRunState(root: string): void {
  const filesToRemove = [
    join(root, ".tmp", "ports", "web.port"),
    join(root, ".tmp", "ports", "server.port"),
    join(root, ".tmp", "pids", "web.pid"),
    join(root, ".tmp", "pids", "server.pid"),
  ];

  for (const file of filesToRemove) {
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch {
        // Ignore deletion errors on shutdown
      }
    }
  }
}

/**
 * Terminates a process and its full child process tree cross-platform.
 * On Windows, invokes taskkill /pid <PID> /T /F to eliminate zombie grandchildren.
 * On POSIX, terminates the negative PID process group.
 */
export function killProcessTree(proc: ChildProcess | { pid?: number | undefined; kill?: (signal?: NodeJS.Signals | number) => boolean } | null | undefined): void {
  if (!proc) return;

  if (proc instanceof ChildProcess) {
    const pid = proc.pid;
    if (!pid) return;

    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        // Process already terminated
      }
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          proc.kill("SIGTERM");
        } catch {
          // Process already terminated
        }
      }
    }
  } else if (typeof proc.kill === "function") {
    try {
      proc.kill();
    } catch {
      // Process already terminated
    }
  }
}


/**
 * Strips ANSI escape sequences (colors, font weights, cursor resets, ECMA-48 codes)
 * so terminal output and written log files are clean plain text.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\([a-zA-Z])/g, "");
}

/**
 * Prepares a service log folder by rotating any existing latest.log to previous.log
 * and initializing an empty latest.log.
 */
export function setupServiceLog(logsDir: string, serviceName: string): string {
  const serviceDir = join(logsDir, serviceName);
  mkdirSync(serviceDir, { recursive: true });
  const latestFile = join(serviceDir, "latest.log");
  const previousFile = join(serviceDir, "previous.log");

  if (existsSync(latestFile)) {
    try {
      if (existsSync(previousFile)) {
        rmSync(previousFile, { force: true });
      }
      renameSync(latestFile, previousFile);
    } catch {
      // Best-effort rotation fallback
    }
  }

  writeFileSync(latestFile, "", "utf-8");
  return latestFile;
}

/**
 * Attaches a line-buffered stream reader that:
 * 1. Sanitizes ANSI codes so output is clean plain text.
 * 2. Writes raw clean lines directly to the dedicated service log file (un-prefixed).
 * 3. Writes prefixed lines ([tag] message) to the terminal output stream (without ANSI colors).
 */
export function attachPrefixedTee(
  stream: NodeJS.ReadableStream | null | undefined,
  tag: string,
  targetOut: NodeJS.WriteStream,
  logFn: (line: string) => void
): void {
  if (!stream) return;
  let buffer = "";
  stream.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    buffer += text;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const cleanLine = stripAnsi(line);
      targetOut.write(`[${tag}] ${cleanLine}\n`);
      logFn(`${cleanLine}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      const cleanLine = stripAnsi(buffer);
      targetOut.write(`[${tag}] ${cleanLine}\n`);
      logFn(`${cleanLine}\n`);
      buffer = "";
    }
  });
}

/**
 * Main development orchestrator.
 */
export async function startDev(options: StartDevOptions = {}): Promise<StartDevResult> {
  const root = resolve(options.root ?? process.cwd());
  ensureStorageLayout(root);

  // `--no-web`: skip the Next.js compiler; the daemon serves the prebuilt pack.
  const withWeb = options.web ?? true;

  const { webPort, serverPort } = await allocateDevPorts({
    preferredWebPort: options.preferredWebPort,
    preferredServerPort: options.preferredServerPort,
  });

  writeDevRunState(root, {
    webPort: withWeb ? webPort : undefined,
    serverPort,
  });

  const logsDir = join(root, ".tmp", "logs");
  const devLogFile = setupServiceLog(logsDir, "dev");
  const serverLogFile = setupServiceLog(logsDir, "server");
  const webLogFile = withWeb ? setupServiceLog(logsDir, "web") : undefined;

  const appendToDevLog = (line: string) => {
    try {
      appendFileSync(devLogFile, stripAnsi(line), "utf-8");
    } catch {
      // Best-effort disk write
    }
  };

  const appendToServerLog = (line: string) => {
    try {
      appendFileSync(serverLogFile, stripAnsi(line), "utf-8");
    } catch {
      // Best-effort disk write
    }
  };

  const appendToWebLog = (line: string) => {
    if (!webLogFile) return;
    try {
      appendFileSync(webLogFile, stripAnsi(line), "utf-8");
    } catch {
      // Best-effort disk write
    }
  };

  const logDev = (message: string) => {
    const cleanMsg = stripAnsi(message);
    const line = `[dev] ${cleanMsg}\n`;
    process.stdout.write(line);
    appendToDevLog(line);
  };

  const logDevErr = (message: string) => {
    const cleanMsg = stripAnsi(message);
    const line = `[dev] ${cleanMsg}\n`;
    process.stderr.write(line);
    appendToDevLog(line);
  };

  logDev(`Initializing Notebench Development Orchestrator`);
  logDev(`   - Fastify Daemon: http://127.0.0.1:${serverPort}`);
  if (withWeb) {
    logDev(`   - Next.js Web UI: http://127.0.0.1:${webPort}`);
  } else {
    logDev(`   - Next.js Web UI: skipped (--no-web; daemon serves the prebuilt pack)`);
  }
  logDev(`   - Port mappings recorded in .tmp/ports/ and PIDs in .tmp/pids/`);
  logDev(`   - Service logs streamed to .tmp/logs/{dev,server,web}/latest.log`);

  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const spawnProcess = options.spawnFn ?? spawn;
  let isShuttingDown = false;

  const serverProcess = spawnProcess(pnpmCmd, ["--filter", "server", "dev"], {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOST: "127.0.0.1",
      PORT: String(serverPort),
    },
  });

  const webProcess = withWeb
    ? spawnProcess(pnpmCmd, ["--filter", "web", "dev"], {
        cwd: root,
        stdio: ["inherit", "pipe", "pipe"],
        shell: process.platform === "win32",
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          NO_COLOR: "1",
          HOST: "127.0.0.1",
          PORT: String(webPort),
          NEXT_PUBLIC_SERVER_PORT: String(serverPort),
          NEXT_PUBLIC_API_URL: `http://127.0.0.1:${serverPort}`,
        },
      })
    : undefined;

  attachPrefixedTee(serverProcess.stdout, "server", process.stdout, appendToServerLog);
  attachPrefixedTee(serverProcess.stderr, "server", process.stderr, appendToServerLog);
  if (webProcess) {
    attachPrefixedTee(webProcess.stdout, "web", process.stdout, appendToWebLog);
    attachPrefixedTee(webProcess.stderr, "web", process.stderr, appendToWebLog);
  }

  writeDevRunState(root, {
    webPort: withWeb ? webPort : undefined,
    serverPort,
    webPid: webProcess?.pid,
    serverPid: serverProcess.pid,
  });

  const shutdown = (code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logDev("Gracefully shutting down development servers...");
    killProcessTree(serverProcess);
    killProcessTree(webProcess);
    cleanDevRunState(root);

    if (!options.root) {
      process.exit(code);
    }
  };

  serverProcess.on("exit", (code) => {
    if (!isShuttingDown) {
      logDevErr(`Fastify daemon exited prematurely with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  webProcess?.on("exit", (code) => {
    if (!isShuttingDown) {
      logDevErr(`Next.js Web UI exited prematurely with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  serverProcess.on("error", (err) => {
    logDevErr(`Fastify process spawn error: ${String(err)}`);
    shutdown(1);
  });

  webProcess?.on("error", (err) => {
    logDevErr(`Next.js process spawn error: ${String(err)}`);
    shutdown(1);
  });

  if (!options.root) {
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
  }

  return {
    webPort: withWeb ? webPort : undefined,
    serverPort,
    serverProcess,
    webProcess,
    shutdown,
  };
}

// Execute orchestrator only when invoked directly as CLI entrypoint
const isDirectExecution = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    const currentPath = fileURLToPath(import.meta.url);
    const invokedPath = resolve(process.argv[1]);
    return (
      invokedPath === currentPath ||
      invokedPath === currentPath.replace(/\.ts$/, ".js") ||
      invokedPath === currentPath.replace(/\.js$/, ".ts")
    );
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: pnpm dev [--no-web]");
    console.log("  --no-web   Skip the Next.js compiler; the daemon serves the prebuilt apps/web/out pack.");
    process.exit(0);
  }
  const { web } = parseDevArgs(argv);
  startDev({ web }).catch((err) => {
    console.error("Failed to start development orchestrator:", err);
    process.exit(1);
  });
}
