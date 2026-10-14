import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/**
 * Web compiler duality resolver (ticket 05, spec 5.10 + 7.2).
 *
 * Explicit sidecar branch: namespaced compiler output directory and
 * generated config with the webpack default. The production export branch
 * stays out of this module: without the sidecar marker the web config is
 * exactly today's export contract (`output: "export"`, `distDir: "out"`).
 *
 * Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
 */

export const WEB_DIST_DIR_ENV = "NOTEBENCH_WEB_DIST_DIR";
export const WEB_DIST_DIR_ENV_ALIAS = "NB_WEB_DIST_DIR";
export const WEB_TSCONFIG_ENV = "NOTEBENCH_WEB_TSCONFIG_PATH";
export const WEB_TSCONFIG_ENV_ALIAS = "NB_WEB_TSCONFIG_PATH";
export const WEB_DEV_BUNDLER_ENV = "NOTEBENCH_WEB_DEV_BUNDLER";
export const WEB_DEV_BUNDLER_ENV_ALIAS = "NB_WEB_DEV_BUNDLER";

export type WebDevBundler = "webpack" | "turbopack";

export interface WebCompilerEnv {
  distDir: string;
  tsconfigPath: string;
  bundler: WebDevBundler;
}

function pick(
  env: Record<string, string | undefined>,
  canonical: string,
  alias: string
): string | undefined {
  const value = env[canonical] ?? env[alias];
  if (value === undefined || value === "") return undefined;
  return value;
}

/**
 * Resolve the sidecar compiler branch from the environment.
 *
 * @param env Environment record (canonical names win over `NB_` aliases).
 * @param buildDir Namespaced disposable build directory
 *   (`.tmp/build/<namespace>`, spec 5.5) used to derive the default
 *   generated-config path when no explicit tsconfig path is given.
 */
export function resolveWebCompilerEnv(
  env: Record<string, string | undefined>,
  buildDir: string
): WebCompilerEnv {
  const distDir = pick(env, WEB_DIST_DIR_ENV, WEB_DIST_DIR_ENV_ALIAS);
  if (distDir === undefined) {
    throw new Error(
      `Web compiler requires ${WEB_DIST_DIR_ENV} (or ${WEB_DIST_DIR_ENV_ALIAS}): absolute namespaced compiler output directory.`
    );
  }
  if (!isAbsolute(distDir)) {
    throw new Error(`Web compiler distDir "${distDir}" must be an absolute path.`);
  }
  const tsconfigRaw =
    pick(env, WEB_TSCONFIG_ENV, WEB_TSCONFIG_ENV_ALIAS) ??
    join(buildDir, SIDECAR_TSCONFIG_FILENAME);
  if (!isAbsolute(tsconfigRaw)) {
    throw new Error(`Web compiler tsconfig path "${tsconfigRaw}" must be an absolute path.`);
  }
  const bundlerRaw = pick(env, WEB_DEV_BUNDLER_ENV, WEB_DEV_BUNDLER_ENV_ALIAS) ?? "webpack";
  if (bundlerRaw !== "webpack" && bundlerRaw !== "turbopack") {
    throw new Error(
      `Unknown web compiler bundler "${bundlerRaw}": expected "webpack" or "turbopack".`
    );
  }
  return { distDir, tsconfigPath: tsconfigRaw, bundler: bundlerRaw };
}

/** Generated sidecar tsconfig filename (spec 5.5: lives under `build/<namespace>/`).
 *
 * Matches `isolate.ts` (`tsconfig.dev.json`): one filename for
 * the generated namespaced tsconfig across the tool. Tickets 01-04 were
 * built in `scripts/dev/` before the track moved here in full; this module is the tickets-05+ resolver/writer.
 */
export const SIDECAR_TSCONFIG_FILENAME = "tsconfig.dev.json";

/**
 * Write the generated namespaced tsconfig for the sidecar compiler branch.
 *
 * The file extends the web package's own tsconfig, so type resolution stays
 * identical while Next reads/writes generated state under the disposable
 * build directory instead of the web package. Returns the absolute path.
 */
export function ensureSidecarTsconfig(buildDir: string, webDir: string): string {
  if (!isAbsolute(buildDir)) {
    throw new Error(`Web compiler buildDir "${buildDir}" must be an absolute path.`);
  }
  if (!isAbsolute(webDir)) {
    throw new Error(`Web compiler webDir "${webDir}" must be an absolute path.`);
  }
  mkdirSync(buildDir, { recursive: true });
  const tsconfigPath = join(buildDir, SIDECAR_TSCONFIG_FILENAME);
  const extendsPath = relative(buildDir, join(webDir, "tsconfig.json"));
  const content = `${JSON.stringify(
    { extends: extendsPath, compilerOptions: {} },
    null,
    2
  )}\n`;
  writeFileSync(tsconfigPath, content, "utf-8");
  return tsconfigPath;
}

function isUnderDir(candidate: string, dir: string): boolean {
  const rel = relative(dir, candidate);
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/**
 * Proof predicate (spec 5.5 + 5.10): a dev compiler path is isolated only
 * when it lives under the namespaced build directory and never inside the
 * web package. Non-absolute candidates are never isolated.
 */
export function isIsolatedCompilerPath(
  candidate: string,
  webDir: string,
  buildDir: string
): boolean {
  if (!isAbsolute(candidate) || !isAbsolute(webDir) || !isAbsolute(buildDir)) {
    return false;
  }
  return isUnderDir(candidate, buildDir) && !isUnderDir(candidate, webDir);
}
