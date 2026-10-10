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
}

export interface StartDevResult {
  webPort: number;
  serverPort: number;
  serverProcess: ChildProcess;
  webProcess: ChildProcess;
  shutdown: (code?: number) => void;
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
 * Strips ANSI escape sequences (colors, font weights, cursor resets) so written log files are clean plain text.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\([a-zA-Z]/g, "");
}

/**
 * Attaches a line-buffered tee reader that prefixes each line with a colored process tag
 * and writes simultaneously to the terminal output stream and the active dev.log file stream (clean plain text).
 */
export function attachPrefixedTee(
  stream: NodeJS.ReadableStream | null | undefined,
  tag: string,
  colorCode: string,
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
      const coloredLine = `${colorCode}[${tag}]\x1b[0m ${line}\n`;
      const cleanLine = `[${tag}] ${stripAnsi(line)}\n`;
      targetOut.write(coloredLine);
      logFn(cleanLine);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      const coloredLine = `${colorCode}[${tag}]\x1b[0m ${buffer}\n`;
      const cleanLine = `[${tag}] ${stripAnsi(buffer)}\n`;
      targetOut.write(coloredLine);
      logFn(cleanLine);
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

  const { webPort, serverPort } = await allocateDevPorts({
    preferredWebPort: options.preferredWebPort,
    preferredServerPort: options.preferredServerPort,
  });

  writeDevRunState(root, { webPort, serverPort });

  const logsDir = join(root, ".tmp", "logs");
  mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, "dev.log");
  const prevLogFile = join(logsDir, "dev.prev.log");

  if (existsSync(logFile)) {
    try {
      if (existsSync(prevLogFile)) {
        rmSync(prevLogFile, { force: true });
      }
      renameSync(logFile, prevLogFile);
    } catch {
      // Ignore rotation errors and fallback to truncate/overwrite
    }
  }

  // Ensure fresh dev.log file exists
  writeFileSync(logFile, "", "utf-8");

  const appendToLog = (line: string) => {
    try {
      appendFileSync(logFile, stripAnsi(line), "utf-8");
    } catch {
      // Best-effort disk write
    }
  };

  const logDev = (message: string) => {
    const line = `\x1b[36m[dev]\x1b[0m ${message}\n`;
    process.stdout.write(line);
    appendToLog(`[dev] ${message}\n`);
  };

  const logDevErr = (message: string) => {
    const line = `\x1b[31m[dev]\x1b[0m ${message}\n`;
    process.stderr.write(line);
    appendToLog(`[dev] ${message}\n`);
  };

  logDev(`🚀 Initializing Notebench Development Orchestrator`);
  logDev(`   - Fastify Daemon: http://127.0.0.1:${serverPort}`);
  logDev(`   - Next.js Web UI: http://127.0.0.1:${webPort}`);
  logDev(`   - Port mappings recorded in .tmp/ports/ and PIDs in .tmp/pids/`);
  logDev(`   - Terminal session log streamed to .tmp/logs/dev.log`);

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
      FORCE_COLOR: "1",
      HOST: "127.0.0.1",
      PORT: String(serverPort),
    },
  });

  const webProcess = spawnProcess(pnpmCmd, ["--filter", "web", "dev"], {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      HOST: "127.0.0.1",
      PORT: String(webPort),
      NEXT_PUBLIC_SERVER_PORT: String(serverPort),
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${serverPort}`,
    },
  });

  attachPrefixedTee(serverProcess.stdout, "server", "\x1b[34m", process.stdout, appendToLog);
  attachPrefixedTee(serverProcess.stderr, "server", "\x1b[31m", process.stderr, appendToLog);
  attachPrefixedTee(webProcess.stdout, "web", "\x1b[35m", process.stdout, appendToLog);
  attachPrefixedTee(webProcess.stderr, "web", "\x1b[31m", process.stderr, appendToLog);

  writeDevRunState(root, {
    webPort,
    serverPort,
    webPid: webProcess.pid,
    serverPid: serverProcess.pid,
  });

  const shutdown = (code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logDev("🛑 Gracefully shutting down development servers...");
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

  webProcess.on("exit", (code) => {
    if (!isShuttingDown) {
      logDevErr(`Next.js Web UI exited prematurely with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  serverProcess.on("error", (err) => {
    logDevErr(`Fastify process spawn error: ${String(err)}`);
    shutdown(1);
  });

  webProcess.on("error", (err) => {
    logDevErr(`Next.js process spawn error: ${String(err)}`);
    shutdown(1);
  });

  if (!options.root) {
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
  }

  return {
    webPort,
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
  startDev().catch((err) => {
    console.error("Failed to start development orchestrator:", err);
    process.exit(1);
  });
}
