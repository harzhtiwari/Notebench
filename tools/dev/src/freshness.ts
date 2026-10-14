import { execFile as nodeExecFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir as fsReaddir, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Freshness gates for the dev orchestrator (ticket 03, spec 5.12).
 *
 * Modification-time gates apply ONLY to workspace dependencies the server
 * actually consumes as compiled output. The web production export is never
 * built in the dev path, and packages the server never imports (notably
 * `@notebook/ui`, whose dist invariant guard check 33 enforces for the web
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
  { name: "@notebook/contracts", dirName: "contracts" },
  { name: "@notebook/logger", dirName: "logger" },
  { name: "@notebook/domain-ops", dirName: "domain-ops" },
  { name: "@notebook/domain-account", dirName: "domain-account" },
  { name: "@notebook/domain-notebooks", dirName: "domain-notebooks" },
  { name: "@notebook/infra-db", dirName: "infra-db" },
  { name: "@notebook/infra-doc-worker", dirName: "infra-doc-worker" },
];

/**
 * Inventory the compiled workspace outputs the server consumes, in
 * dependency order (dependees first) so a rebuild cascade stays correct.
 * Every entry resolves to `dist/index.js`, matching each package's
 * `main`/`exports` map.
 */
export function serverCompiledDeps(root: string): CompiledDep[] {
  return SERVER_DEP_ORDER.map((dep) => {
    const dir = join(root, "packages", dep.dirName);
    return {
      name: dep.name,
      dir,
      distEntry: join("dist", "index.js"),
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

async function defaultListFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let dirents: Dirent[];
    try {
      dirents = await fsReaddir(current, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const dirent of dirents) {
      if (dirent.name === "node_modules" || dirent.name === "dist") continue;
      const full = join(current, dirent.name);
      if (dirent.isDirectory()) stack.push(full);
      else if (dirent.isFile()) out.push(full);
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
  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/d", "/s", "/c", `pnpm --filter ${dep.name} build`], {
      cwd: root,
      shell: false,
    });
    return;
  }
  await execFileAsync("pnpm", ["--filter", dep.name, "build"], {
    cwd: root,
    shell: false,
  });
}

async function isDepFresh(
  dep: CompiledDep,
  statMtimeMs: (path: string) => Promise<number | null>,
  listFilesRecursive: (dir: string) => Promise<string[]>
): Promise<boolean> {
  const distMtime = await statMtimeMs(join(dep.dir, dep.distEntry));
  if (distMtime === null) return false;
  const inputs = await listFilesRecursive(dep.srcDir);
  inputs.push(join(dep.dir, "package.json"));
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
