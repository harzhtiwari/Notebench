import { isAbsolute, join, relative, sep } from "node:path";
import { parseNamespace } from "./args.js";
import { OrchestratorError } from "./types.js";

/** Every filesystem location owned by one namespaced orchestrator run. */
export interface RunPaths {
  root: string;
  namespace: string;
  portsDir: string;
  serverPortFile: string;
  webPortFile: string;
  pidsDir: string;
  serverPidFile: string;
  webPidFile: string;
  devLogFile: string;
  serverLogFile: string;
  webLogFile: string;
  buildDir: string;
  runDir: string;
  identityFile: string;
  /** All owned files (port/PID/log/identity records) for enumeration. */
  files: Record<string, string>;
}

/**
 * Resolve the disposable-state layout for a namespace:
 * `.tmp/ports/<ns>`, `.tmp/pids/<ns>`, `.tmp/logs/<service>/<ns>`,
 * `.tmp/build/<ns>`, `.tmp/run/<ns>/identity.json`.
 * Every path is verified to stay under the workspace root.
 */
export function resolveRunPaths(root: string, namespace: string): RunPaths {
  if (!isAbsolute(root)) {
    throw new OrchestratorError(
      `Invalid workspace root "${root}": must be an absolute path.`,
      1
    );
  }
  const ns = parseNamespace(namespace);
  const tmp = join(root, ".tmp");

  const portsDir = join(tmp, "ports", ns);
  const serverPortFile = join(portsDir, "server.port");
  const webPortFile = join(portsDir, "web.port");
  const pidsDir = join(tmp, "pids", ns);
  const serverPidFile = join(pidsDir, "server.pid");
  const webPidFile = join(pidsDir, "web.pid");
  const devLogFile = join(tmp, "logs", "dev", ns, "latest.log");
  const serverLogFile = join(tmp, "logs", "server", ns, "latest.log");
  const webLogFile = join(tmp, "logs", "web", ns, "latest.log");
  const buildDir = join(tmp, "build", ns);
  const runDir = join(tmp, "run", ns);
  const identityFile = join(runDir, "identity.json");

  const files: Record<string, string> = {
    serverPort: serverPortFile,
    webPort: webPortFile,
    serverPid: serverPidFile,
    webPid: webPidFile,
    devLog: devLogFile,
    serverLog: serverLogFile,
    webLog: webLogFile,
    identity: identityFile,
  };
  for (const [name, file] of Object.entries(files)) {
    const rel = relative(root, file);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
      throw new OrchestratorError(
        `Refusing to resolve ${name} outside the workspace root.`,
        1
      );
    }
  }

  return {
    root,
    namespace: ns,
    portsDir,
    serverPortFile,
    webPortFile,
    pidsDir,
    serverPidFile,
    webPidFile,
    devLogFile,
    serverLogFile,
    webLogFile,
    buildDir,
    runDir,
    identityFile,
    files,
  };
}
