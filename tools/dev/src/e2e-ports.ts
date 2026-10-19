import { existsSync as fsExistsSync } from "node:fs";
import path from "node:path";
import { parseNamespace } from "./args.js";
import { defaultReadFileSync } from "./defaults.js";

/**
Namespace-aware end-to-end port reader (ticket 03, spec 7.3).

Resolution order: namespaced `ports/<ns>/web.port`, then the legacy flat
`ports/web.port`, then the pre-orchestrator `ports/e2e-web.port` residue,
then `PORT` env, then the `3100` default. An invalid namespace env value
throws (this module is loaded at playwright.config.ts load time, so the
run fails as a config error instead of silently reading `default`).
Explicit Playwright base URLs always win at the base-URL level. Unreadable
or malformed port files fall through to the next source instead of
throwing, so a half-written run never breaks E2E.
*/

export interface E2EPortReaderDeps {
  exists?: ((path: string) => boolean) | undefined;
  readFile?: ((path: string) => string) | undefined;
}

function isFilePresent(path: string): boolean {
  try {
    return fsExistsSync(path);
  } catch {
    return false;
  }
}

function parsePortText(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const port = Number(trimmed);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
}

function readPortFile(
  path: string,
  isPresent: (path: string) => boolean,
  readFile: (path: string) => string
): number | undefined {
  try {
    return isPresent(path) ? parsePortText(readFile(path)) : undefined;
  } catch {
    return undefined;
  }
}

function resolveNamespace(env: Record<string, string | undefined>): string {
  // P26: an invalid namespace is a hard failure (config-load time), never a
  // silent fallback to `default`.
  return parseNamespace(env["NOTEBENCH_NAMESPACE"] ?? env["NB_NAMESPACE"] ?? "default");
}

function parseEnvPort(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parsePortText(value);
}

/**
Resolve the live web port for E2E: namespaced record first, legacy flat
`web.port` next (before the `e2e-web.port` residue, per spec 7.3), `PORT`
env after that, `3100` default last. An invalid namespace env value throws
instead of silently reading `default`.
*/
export function resolveE2EWebPort(
  root: string,
  env: Record<string, string | undefined> = process.env,
  deps?: E2EPortReaderDeps  
): number | undefined {
  const exists = deps?.exists ?? isFilePresent;
  const readFile = deps?.readFile ?? defaultReadFileSync;
  const namespace = resolveNamespace(env);
  const namespaced = readPortFile(path.join(root, ".tmp", "ports", namespace, "web.port"), exists, readFile);
  if (namespaced !== undefined) return namespaced;
  const legacyFlat = readPortFile(path.join(root, ".tmp", "ports", "web.port"), exists, readFile);
  if (legacyFlat !== undefined) return legacyFlat;
  const legacyE2E = readPortFile(path.join(root, ".tmp", "ports", "e2e-web.port"), exists, readFile);
  return legacyE2E ?? parseEnvPort(env["PORT"]) ?? 3100;
}

/**
Resolve the Playwright base URL: explicit `PLAYWRIGHT_*` env URLs first,
otherwise `http://127.0.0.1:<resolved web port>`.
*/
export function resolveE2EBaseUrl(
  root: string,
  env: Record<string, string | undefined> = process.env,
  deps?: E2EPortReaderDeps  
): string {
  const explicit = env["PLAYWRIGHT_TEST_BASE_URL"] ?? env["PLAYWRIGHT_BASE_URL"];
  return explicit !== undefined && explicit !== "" ? explicit : `http://127.0.0.1:${String(resolveE2EWebPort(root, env, deps))}`;
}
