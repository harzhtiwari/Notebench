import { parsePortInput } from "./ports.js";
import { OrchestratorError } from "./types.js";
import type { OrchestratorOptions, WarmupMode } from "./types.js";

/**
 * Namespace allowlist: starts with a letter or digit, then letters, digits,
 * `-`, `_`, max 32 chars. Rejects traversal-like values by construction
 * (no `.`, `/`, `\`, separators, or whitespace allowed).
 */
const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function parseNamespace(value: unknown): string {
  if (typeof value === "string" && NAMESPACE_PATTERN.test(value)) return value;
  const shown = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  throw new OrchestratorError(
    `Invalid namespace "${shown}": must start with a letter or digit, ` +
      `contain only letters, digits, "-" and "_", max 32 characters.`,
    1
  );
}

type Env = Record<string, string | undefined>;

function firstDefined(env: Env, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

const FLAGS_WITH_VALUE = new Set(["--namespace", "--server-port", "--web-port", "--warmup"]);

interface RawFlags {
  namespace?: string | undefined;
  serverPort?: string | undefined;
  webPort?: string | undefined;
  warmup?: string | undefined;
}

/** Parse `pnpm dev` flags. Supports `--flag value` and `--flag=value`. */
function parseFlags(argv: string[]): RawFlags {
  const raw: RawFlags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const [head, ...rest] = arg.split("=");
    const name = head ?? "";
    if (!name.startsWith("--")) {
      throw new OrchestratorError(`Unexpected argument "${arg}": only documented --flags are accepted.`, 1);
    }
    if (!FLAGS_WITH_VALUE.has(name)) {
      throw new OrchestratorError(
        `Unknown flag "${name}": expected one of ${[...FLAGS_WITH_VALUE].join(", ")}.`,
        1
      );
    }
    let value: string | undefined;
    if (rest.length > 0) {
      value = rest.join("=");
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new OrchestratorError(`Flag "${name}" requires a value.`, 1);
      }
      value = next;
      i += 1;
    }
    if (name === "--namespace") raw.namespace = value;
    else if (name === "--server-port") raw.serverPort = value;
    else if (name === "--web-port") raw.webPort = value;
    else raw.warmup = value;
  }
  return raw;
}

function parseWarmup(value: string | undefined): WarmupMode {
  if (value === undefined) return "route";
  if (value === "route" || value === "ui") return value;
  throw new OrchestratorError(`Invalid --warmup "${value}": expected "route" or "ui".`, 1);
}

/**
 * Resolve the orchestrator options with documented precedence:
 * explicit flag, then canonical `NOTEBENCH_*` env, then `NB_*` alias
 * short fallback, then default. Upstream (OpenDesign `OD_*`-family) env
 * names are never read here.
 */
export function parseOrchestratorArgs(argv: string[], env: Env = process.env): OrchestratorOptions {
  const raw = parseFlags(argv);

  const namespaceRaw =
    raw.namespace ?? firstDefined(env, ["NOTEBENCH_NAMESPACE", "NB_NAMESPACE"]) ?? "default";
  const serverPortRaw =
    raw.serverPort ?? firstDefined(env, ["NOTEBENCH_SERVER_PORT", "NB_SERVER_PORT"]);
  const webPortRaw = raw.webPort ?? firstDefined(env, ["NOTEBENCH_WEB_PORT", "NB_WEB_PORT"]);

  return {
    namespace: parseNamespace(namespaceRaw),
    serverPort: serverPortRaw === undefined ? undefined : parsePortInput(serverPortRaw, "server port"),
    webPort: webPortRaw === undefined ? undefined : parsePortInput(webPortRaw, "web port"),
    warmup: parseWarmup(raw.warmup),
  };
}
