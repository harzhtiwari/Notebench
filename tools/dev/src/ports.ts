import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import getPort from "get-port";
import { OrchestratorError } from "./types.js";
import type { ServiceName } from "./types.js";

export { OrchestratorError } from "./types.js";

const execFileAsync = promisify(execFile);

/**
Parse a user-facing port value. Accepts integers 1-65535 only.
`0` is rejected: automatic allocation is requested by omitting the
flag/env var (internally `undefined`), never by passing 0.
*/
export function parsePortInput(value: unknown, label: string): number {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 1 && value <= 65_535) return value;
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65_535) return parsed;
    }
  const shown = typeof value === "string" ? value : JSON.stringify(value);
  throw new OrchestratorError(
    `Invalid ${label} "${shown}": expected an integer port 1-65535 ` +
      `(omit the flag for automatic allocation).`,
    1
  );
}

/**
True when nothing is listening on port/host right now.
*/
export function checkPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

/**
Best-effort occupant description for a taken port (e.g. `pid 1234
(node.exe)`). Returns `"unknown"` when the OS lookup is unavailable or
inconclusive. Never throws.
*/
export async function describePortOccupant(port: number, host: string): Promise<string> {
  try {
    return process.platform === "win32" ? (await describeOccupantWindows(port, host)) : (await describeOccupantPosix(port, host));
  } catch {
    return "unknown";
  }
}

async function describeOccupantWindows(port: number, host: string): Promise<string> {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"], {
    timeout: 2000,
    shell: false,
    windowsHide: true,
  });
  const pid = parseNetstatPid(stdout, port, host);
  if (pid === undefined) return "unknown";
  try {
    const { stdout: task } = await execFileAsync(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { timeout: 2000, shell: false, windowsHide: true }
    );
    const image = task.split(",", 1)[0]?.replaceAll('"', "").trim();
    return image !== undefined && image !== "" ? `pid ${pid} (${image})` : `pid ${pid}`;
  } catch {
    return `pid ${pid}`;
  }
}

function parseNetstatPid(output: string, port: number, host: string): string | undefined {
  let fallback: string | undefined;
  for (const line of output.split("\n")) {
    const parts = line.trim().split(/\s+/);
    // `TCP    127.0.0.1:3123    0.0.0.0:0    LISTENING    1234`
    if (parts.length < 4 || parts[0]?.toUpperCase() !== "TCP" || parts[3]?.toUpperCase() !== "LISTENING") {
      continue;
    }
    const local = parts[1] ?? "";
    if (!local.endsWith(`:${port}`)) continue;
    const pid = parts.at(-1);
    if (pid === undefined || !/^\d+$/.test(pid)) continue;
    if (local === `${host}:${port}`) return pid;
    fallback ??= pid;
  }
  return fallback;
}

async function describeOccupantPosix(port: number, host: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "lsof",
    [`-iTCP:${port}`, "-sTCP:LISTEN", "-P", "-n"],
    { timeout: 2000, shell: false, windowsHide: true }
  );
  let fallback: string | undefined;
  for (const line of stdout.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    // `COMMAND   PID   USER ... NAME`
    if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined || !/^\d+$/.test(parts[1])) {
      continue;
    }
    const candidate = `pid ${parts[1]} (${parts[0]})`;
    const name = parts.at(-1) ?? "";
    if (name.includes(`${host}:${port}`)) return candidate;
    fallback ??= candidate;
  }
  return fallback ?? "unknown";
}

/**
Build the fail-fast conflict error for a forced port that is taken.
*/
export function formatPortConflictError(
  service: ServiceName | "server" | "web",
  port: number,
  occupant: string
): OrchestratorError {
  return new OrchestratorError(
    `Port ${port} for ${service} is already in use (${occupant}). ` +
      `Use a different --${service}-port or stop the occupant.`,
    2
  );
}

export interface AllocateRequests {
  serverPort?: number | undefined;
  webPort?: number | undefined;
  host?: string | undefined;
}

export interface AllocatedPorts {
  serverPort: number;
  webPort: number;
}

interface AllocateDeps {
  /**
  Automatic-allocation seam; production uses `get-port` directly, tests
  inject a deterministic allocator.
  */
  getPortFn?:
    | ((options?: { exclude?: Iterable<number>; host?: string }) => Promise<number>)
    | undefined;
}

/**
Bounded retries when an auto-assigned port lands inside the reserved set.
*/
const AUTO_PORT_ATTEMPTS = 10;

/**
Allocate one run's ports. Forced ports are honored exactly and fail fast
(exit 2) on conflict; automatic ports come from get-port with a shared
reserved set so the two services can never share a port in one run.
*/
export async function allocateRunPorts(
  requests: AllocateRequests = {},
  deps?: AllocateDeps  
): Promise<AllocatedPorts> {
  const host = requests.host ?? "127.0.0.1";
  const reserved = new Set<number>();
  const alloc = deps?.getPortFn ?? getPort;
  const serverPort = await takePort("server", requests.serverPort, reserved, host, alloc);
  const webPort = await takePort("web", requests.webPort, reserved, host, alloc);
  return { serverPort, webPort };
}

async function takePort(
  service: "server" | "web",
  forced: number | undefined,
  reserved: Set<number>,
  host: string,
  alloc: NonNullable<AllocateDeps["getPortFn"]>
): Promise<number> {
  if (forced !== undefined) {
    const port = parsePortInput(forced, `${service} port`);
    if (reserved.has(port)) {
      throw formatPortConflictError(service, port, "reserved by this run");
    }
    if (!(await checkPortAvailable(port, host))) {
      throw formatPortConflictError(service, port, await describePortOccupant(port, host));
    }
    reserved.add(port);
    return port;
  }
  // get-port v7 filters `exclude` only against its preferred-port sequence;
  // with no preferred port (the auto path) the assigned port is unchecked, so
  // a forced port inside the ephemeral range could still be handed to the
  // other service (P28). Enforce the reserved set after allocation, retrying
  // when the allocator returns a reserved port.
  for (let attempt = 0; attempt < AUTO_PORT_ATTEMPTS; attempt += 1) {
    const port = await alloc({ exclude: [...reserved], host });
    if (reserved.has(port)) continue;
    reserved.add(port);
    return port;
  }
  throw new OrchestratorError(
    `Could not allocate a ${service} port outside this run's reserved set ` +
      `(${[...reserved].join(", ")}).`,
    1
  );
}
