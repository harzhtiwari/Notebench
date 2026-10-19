import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Design-token lint for the built static export, wired into CI after the
 * production build and runnable locally with `pnpm lint:tokens`.
 *
 * Runs the two Python design linters from packages/ui against the web build:
 *   - check_contrast.py: token contrast pairs (light + dark, color blindness)
 *   - lint_tokens.py: literal colors/lengths/times/z-index in <style> blocks
 *     and style="" attributes of the rendered pages
 *
 * Only app pages are linted. Next.js emits framework-owned 404 chrome
 * (404.html, _not-found.html) whose inline styles are framework literals we
 * cannot tokenize; underscore-prefixed paths are Next internals by
 * convention.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "apps", "web", "out");
const UI_DIR = join(ROOT, "packages", "ui");

export function selectTokenLintTargets(files: readonly string[]): string[] {
  return files
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .filter((file) => {
      const segments = file.split(/[/\\]/);
      if (segments.some((segment) => segment.startsWith("_"))) return false;
      return basename(file) !== "404.html";
    })
    .sort();
}

function resolvePython(): string | null {
  for (const candidate of ["python", "python3"]) {
    const probe = spawnSync(candidate, ["-I", "-c", "pass"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: ROOT });
  if (result.error !== undefined) {
    console.error(`[lint:tokens] failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function runCli(): void {
  if (!existsSync(OUT_DIR)) {
    console.error(
      "[lint:tokens] apps/web/out is missing. Build the web app first: pnpm --filter @notebench/web build"
    );
    process.exit(1);
  }

  const listing = readdirSync(OUT_DIR, { recursive: true, encoding: "utf8" });
  const targets = selectTokenLintTargets(listing);
  if (targets.length === 0) {
    console.error(`[lint:tokens] no pages found under apps/web/out (${sep} separated listing).`);
    process.exit(1);
  }

  const python = resolvePython();
  if (python === null) {
    console.error(
      "[lint:tokens] no Python 3 interpreter found (tried: python, python3). The token linters are Python scripts."
    );
    process.exit(1);
  }

  let status = run(python, ["-I", join(UI_DIR, "check_contrast.py")]);
  if (status === 0) {
    status = run(python, [
      "-I",
      join(UI_DIR, "lint_tokens.py"),
      ...targets.map((target) => join(OUT_DIR, target)),
    ]);
  }
  if (status === 0) {
    console.log(`[lint:tokens] contrast + literal-value lint passed for ${targets.join(", ")}`);
  }
  process.exit(status);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCli();
