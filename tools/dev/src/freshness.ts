import { execFile as nodeExecFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir as fsReaddir, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Freshness gates for the dev orchestrator (ticket 03, spec 5.12).
 *
 * Modification-time gates apply ONLY to workspace dependencies the server
 * actually consumes as compiled output. The web production export is never
 * built in the dev path, and packages the server never imports (notably
 * `@notebench/ui`, whose dist invariant guard check 33 enforces for the web
 * bundler) are not gated here.
 */

export interface CompiledDep {
  /** Workspace package name. */
  name: string;
  /** Absolute package directory. */
  dir: string;
  /** Compiled entry consumed at runtime, relative to dir. */
  distEntry: string;
  /** TypeScript sources, relative to dir. */
  srcDir: string;
}

const SERVER_DEP_ORDER: ReadonlyArray<{ name: string; dirName: string }> = [
  { name: "@notebench/contracts", dirName: "contracts" },
  { name: "@notebench/logger", dirName: "logger" },
  { name: "@notebench/domain-ops", dirName: "domain-ops" },
  { name: "@notebench/domain-account", dirName: "domain-account" },
  { name: "@notebench/domain-notebooks", dirName: "domain-notebooks" },
  { name: "@notebench/infra-db", dirName: "infra-db" },
  { name: "@notebench/infra-doc-worker", dirName: "infra-doc-worker" },
  { name: "@notebench/infra-llm", dirName: "infra-llm" },
  { name: "@notebench/infra-vault", dirName: "infra-vault" },
];

/**
 * Build configuration consumed by each package's `tsdown` build: editing one
 * changes the compiled output, so it is a freshness input. A package without
 * one (e.g. infra-llm uses tsdown defaults) simply stats as missing.
 */
const BUILD_CONFIG_FILES = ["tsdown.config.ts", "tsconfig.json"] as const;

/**
 * Resolve the compiled root entry a package exposes, from its own manifest:
 * `exports["."].import`, else `main`. Returned relative to the package dir
 * (leading `./` stripped) so bundler-specific extensions like `dist/index.mjs`
 * stay correct. Unreadable or entry-less manifests fall back to the
 * conventional `dist/index.js`; a missing dist still forces a rebuild.
 */
function resolveDistEntry(dir: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
      exports?: unknown;
      main?: unknown;
    };
    const rootExport =
      typeof manifest.exports === "object" && manifest.exports !== null
        ? (manifest.exports as Record<string, unknown>)["."]
        : manifest.exports;
    const importTarget =
      typeof rootExport === "object" && rootExport !== null
        ? (rootExport as Record<string, unknown>)["import"]
        : rootExport;
    const entry = typeof importTarget === "string" && importTarget.length > 0 ? importTarget : manifest.main;
    if (typeof entry === "string" && entry.length > 0) {
      return entry.replace(/^\.\//, "");
    }
  } catch {
    // Unreadable manifest (e.g. bare fixture root): use the conventional entry.
  }
  return "dist/index.js";
}

/**
 * Inventory the compiled workspace outputs the server consumes, in
 * dependency order (dependees first) so a rebuild cascade stays correct.
 * Each entry's compiled path is resolved from the package's own manifest
 * (`exports["."].import` / `main`). This list must stay in lockstep with the
 * server's workspace dependencies; `dev.realbuild.test.ts` cross-checks it
 * against `apps/server/package.json`.
 */
export function serverCompiledDeps(root: string): CompiledDep[] {
  return SERVER_DEP_ORDER.map((dep) => {
    const dir = join(root, "packages", dep.dirName);
    return {
      name: dep.name,
      dir,
      distEntry: resolveDistEntry(dir),
      srcDir: join(dir, "src"),
    };
  });
}

export interface FreshnessDeps {
  statMtimeMs?: ((path: string) => Promise<number | null>) | undefined;
  listFilesRecursive?: ((dir: string) => Promise<string[]>) | undefined;
  runBuild?: ((dep: CompiledDep) => Promise<void> | void) | undefined;
}

export interface FreshnessResult {
  rebuilt: string[];
  skipped: string[];
}

async function defaultStatMtimeMs(path: string): Promise<number | null> {
  try {
    const info = await fsStat(path);
    return info.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Enumerate every freshness input under `dir`: files plus directories. A
 * directory mtime is an input because deleting an entry updates its parent
 * directory's mtime, so deletions invalidate without persisted state. Any
 * readdir failure rejects instead of returning a partial list — the walk
 * could not prove freshness, and the caller must force a rebuild.
 */
async function defaultListFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const dirents = await fsReaddir(current, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name === "node_modules" || dirent.name === "dist") continue;
      const full = join(current, dirent.name);
      if (dirent.isDirectory()) {
        out.push(full);
        stack.push(full);
      } else if (dirent.isFile()) out.push(full);
    }
  }
  return out;
}

const execFileAsync = promisify(nodeExecFile);

/**
 * Default per-package rebuild: the package's own `build` script via the
 * pinned package manager, from the workspace root. Supervised children stay
 * shell-free, but a one-shot build step must go through the platform
 * interpreter: on Windows `pnpm` is a `.ps1`/`.cmd` shim that CreateProcess
 * cannot execute (bare `execFile("pnpm")` fails with ENOENT/EINVAL), so the
 * explicit `cmd.exe /d /s /c` argv form is used. Never touches `apps/web`.
 */
export async function defaultRunBuild(dep: CompiledDep, root: string): Promise<void> {
  // Mid-tree delegation: cmd.exe -> pnpm -> turbo -> node tasks. Shares the
  // parent console on purpose (see spawn.ts supervisedDetached): hiding or
  // detaching here would leave the whole build toolchain without a console,
  // and each descendant would pop a fresh visible window on `pnpm dev`.
  // Flags are explicit so a later sweep can't silently re-hide this link.
  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/d", "/s", "/c", `pnpm --filter ${dep.name} build`], {
      cwd: root,
      shell: false,
      windowsHide: false,
    });
    return;
  }
  await execFileAsync("pnpm", ["--filter", dep.name, "build"], {
    cwd: root,
    shell: false,
  });
}

/**
 * Fresh means the dist entry exists and every input is older than it. Inputs
 * are the enumerated source tree (files and directories), the src root
 * itself (deleting a direct child updates its mtime), package.json, and the
 * build configs. An enumeration failure returns not-fresh: the walk could
 * not prove freshness, so the package must rebuild.
 */
async function isDepFresh(
  dep: CompiledDep,
  statMtimeMs: (path: string) => Promise<number | null>,
  listFilesRecursive: (dir: string) => Promise<string[]>
): Promise<boolean> {
  const distMtime = await statMtimeMs(join(dep.dir, dep.distEntry));
  if (distMtime === null) return false;
  let inputs: string[];
  try {
    inputs = await listFilesRecursive(dep.srcDir);
  } catch {
    return false;
  }
  inputs.push(dep.srcDir, join(dep.dir, "package.json"));
  for (const configFile of BUILD_CONFIG_FILES) {
    inputs.push(join(dep.dir, configFile));
  }
  for (const input of inputs) {
    const mtime = await statMtimeMs(input);
    if (mtime !== null && mtime > distMtime) return false;
  }
  return true;
}

/**
 * Rebuild missing or stale compiled outputs for the server's workspace
 * dependencies, in dependency order. Fresh outputs are skipped. Resolves
 * which packages were rebuilt vs skipped.
 */
export async function ensureServerFreshness(
  root: string,
  deps?: FreshnessDeps | undefined
): Promise<FreshnessResult> {
  const statMtimeMs = deps?.statMtimeMs ?? defaultStatMtimeMs;
  const listFilesRecursive = deps?.listFilesRecursive ?? defaultListFilesRecursive;
  const runBuild =
    deps?.runBuild ?? ((dep: CompiledDep) => defaultRunBuild(dep, root));
  const rebuilt: string[] = [];
  const skipped: string[] = [];
  for (const dep of serverCompiledDeps(root)) {
    if (await isDepFresh(dep, statMtimeMs, listFilesRecursive)) {
      skipped.push(dep.name);
    } else {
      await runBuild(dep);
      rebuilt.push(dep.name);
    }
  }
  return { rebuilt, skipped };
}
