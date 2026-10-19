import path from "node:path";
import { parseNamespace } from "./args.js";
import { OrchestratorError } from "./types.js";

/**
Every filesystem location owned by one namespaced orchestrator run.
*/
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
  /**
  All owned files (port/PID/log/identity records) for enumeration.
  */
  files: Record<string, string>;
}

/**
Resolve the disposable-state layout for a namespace:
`.tmp/ports/<ns>`, `.tmp/pids/<ns>`, `.tmp/logs/<service>/<ns>`,
`.tmp/build/<ns>`, `.tmp/run/<ns>/identity.json`.
Every path is verified to stay under the workspace root.
*/
export function resolveRunPaths(root: string, namespace: string): RunPaths {
  if (!path.isAbsolute(root)) {
    throw new OrchestratorError(
      `Invalid workspace root "${root}": must be an absolute path.`,
      1
    );
  }
  const ns = parseNamespace(namespace);
  const tmp = path.join(root, ".tmp");

  const portsDir = path.join(tmp, "ports", ns);
  const serverPortFile = path.join(portsDir, "server.port");
  const webPortFile = path.join(portsDir, "web.port");
  const pidsDir = path.join(tmp, "pids", ns);
  const serverPidFile = path.join(pidsDir, "server.pid");
  const webPidFile = path.join(pidsDir, "web.pid");
  const devLogFile = path.join(tmp, "logs", "dev", ns, "latest.log");
  const serverLogFile = path.join(tmp, "logs", "server", ns, "latest.log");
  const webLogFile = path.join(tmp, "logs", "web", ns, "latest.log");
  const buildDir = path.join(tmp, "build", ns);
  const runDir = path.join(tmp, "run", ns);
  const identityFile = path.join(runDir, "identity.json");

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
    const rel = path.relative(root, file);
    if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)) {
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
