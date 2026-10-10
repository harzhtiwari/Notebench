import "dotenv/config";
import { spawn, execSync, ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
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
    join(root, ".tmp", "run"),
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
 * Records active development ports and PIDs into .tmp/run/ (and .tmp/ports/ / .tmp/pids/ for legacy compatibility).
 */
export function writeDevRunState(root: string, state: DevRunState): void {
  const runDir = join(root, ".tmp", "run");
  const portsDir = join(root, ".tmp", "ports");
  const pidsDir = join(root, ".tmp", "pids");

  mkdirSync(runDir, { recursive: true });
  mkdirSync(portsDir, { recursive: true });
  mkdirSync(pidsDir, { recursive: true });

  if (state.webPort !== undefined) {
    writeFileSync(join(runDir, "web.port"), String(state.webPort), "utf-8");
    writeFileSync(join(portsDir, "web.port"), String(state.webPort), "utf-8");
  }

  if (state.serverPort !== undefined) {
    writeFileSync(join(runDir, "server.port"), String(state.serverPort), "utf-8");
    writeFileSync(join(portsDir, "server.port"), String(state.serverPort), "utf-8");
  }

  if (state.webPid !== undefined) {
    writeFileSync(join(runDir, "web.pid"), String(state.webPid), "utf-8");
    writeFileSync(join(pidsDir, "web.pid"), String(state.webPid), "utf-8");
  }

  if (state.serverPid !== undefined) {
    writeFileSync(join(runDir, "server.pid"), String(state.serverPid), "utf-8");
    writeFileSync(join(pidsDir, "server.pid"), String(state.serverPid), "utf-8");
  }
}

/**
 * Cleans up ephemeral port and PID files from .tmp/run/, .tmp/ports/, and .tmp/pids/.
 */
export function cleanDevRunState(root: string): void {
  const filesToRemove = [
    join(root, ".tmp", "run", "web.port"),
    join(root, ".tmp", "run", "server.port"),
    join(root, ".tmp", "run", "web.pid"),
    join(root, ".tmp", "run", "server.pid"),
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

  console.log(`\n🚀 Initializing Notebench Development Orchestrator`);
  console.log(`   - Fastify Daemon: http://127.0.0.1:${serverPort}`);
  console.log(`   - Next.js Web UI: http://127.0.0.1:${webPort}`);
  console.log(`   - Port mappings recorded in .tmp/run/ (and .tmp/ports/)\n`);

  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const spawnProcess = options.spawnFn ?? spawn;
  let isShuttingDown = false;

  const serverProcess = spawnProcess(pnpmCmd, ["--filter", "server", "dev"], {
    cwd: root,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(serverPort),
    },
  });

  const webProcess = spawnProcess(pnpmCmd, ["--filter", "web", "dev"], {
    cwd: root,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(webPort),
      NEXT_PUBLIC_SERVER_PORT: String(serverPort),
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${serverPort}`,
    },
  });

  writeDevRunState(root, {
    webPort,
    serverPort,
    webPid: webProcess.pid,
    serverPid: serverProcess.pid,
  });

  const shutdown = (code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\n🛑 Gracefully shutting down development servers...");
    killProcessTree(serverProcess);
    killProcessTree(webProcess);
    cleanDevRunState(root);

    if (!options.root) {
      process.exit(code);
    }
  };

  serverProcess.on("exit", (code) => {
    if (!isShuttingDown) {
      console.error(`\n❌ Fastify daemon exited prematurely with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  webProcess.on("exit", (code) => {
    if (!isShuttingDown) {
      console.error(`\n❌ Next.js Web UI exited prematurely with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  serverProcess.on("error", (err) => {
    console.error("Fastify process spawn error:", err);
    shutdown(1);
  });

  webProcess.on("error", (err) => {
    console.error("Next.js process spawn error:", err);
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
