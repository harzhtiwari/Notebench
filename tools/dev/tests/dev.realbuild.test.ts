import { afterEach, describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultRunBuild, ensureServerFreshness, serverCompiledDeps } from "../src/freshness.js";
import type { CompiledDep } from "../src/freshness.js";
import { makeTempRoot, removeTempRoots } from "./temp-dir.js";

/**
 * Ticket 03 quarantine: the real-package rebuild through the platform
 * interpreter (Windows `cmd.exe` path).
 *
 * This test shells out to `pnpm --filter <pkg> build` (a full package build
 * inside vitest, up to 120 s). Run in parallel with the other orchestrator
 * suites it intermittently kills the vitest worker on Windows (fail-fast
 * `3221226505`, parallel-only, never solo), so it is opt-in: skipped unless
 * `NOTEBENCH_RUN_REAL_BUILD=1` is set. Default `pnpm test` stays parallel
 * and stable; verify explicitly and solo:
 *
 *   $env:NOTEBENCH_RUN_REAL_BUILD="1"; npx vitest run tools/dev/tests/dev.realbuild.test.ts
 *
 * Ticket 08 (stabilize) owns re-integration or a permanent serial slot.
 */
const runRealBuild = process.env["NOTEBENCH_RUN_REAL_BUILD"] === "1";

it.skipIf(!runRealBuild)(
  "rebuilds a real package through the platform interpreter (Windows cmd.exe path)",
  async () => {
    const root = process.cwd();
    await expect(
      defaultRunBuild(
        {
          name: "@notebook/logger",
          dir: join(root, "packages", "logger"),
          distEntry: join("dist", "index.js"),
          srcDir: join(root, "packages", "logger", "src"),
        },
        root
      )
    ).resolves.toBeUndefined();
  },
  120_000
);

/**
 * T3.1 (P3): the inventory must match the server's declared workspace
 * dependencies, and each entry must resolve through the package's own
 * exports/main map (infra-llm and infra-vault ship `dist/index.mjs`). These
 * cases only read manifests and run unconditionally; the real-package build
 * above stays opt-in.
 */

/**
 * Server workspace dependencies that are deliberately not compiled freshness
 * inputs, each with the reason. Anything not listed here must appear in
 * SERVER_DEP_ORDER, so the inventory can never silently drift again.
 */
const FRESHNESS_EXCLUSIONS: Readonly<Record<string, string>> = {
  "@notebook/tsconfig": "build-time tsconfig base only; never imported at server runtime",
};

function serverDeclaredWorkspaceDeps(root: string): string[] {
  const manifest = JSON.parse(readFileSync(join(root, "apps", "server", "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  return [...declared]
    .filter((name) => name.startsWith("@notebook/") && !(name in FRESHNESS_EXCLUSIONS))
    .sort();
}

describe("ticket 03: freshness inventory matches the server manifests (T3.1)", () => {
  it("covers every @notebook/* server dependency (or names it in the exclusion set)", () => {
    const root = process.cwd();
    const covered = serverCompiledDeps(root)
      .map((dep) => dep.name)
      .sort();
    expect(covered).toEqual(serverDeclaredWorkspaceDeps(root));
  });

  it("resolves each dist entry from the package's own exports/main", () => {
    const root = process.cwd();
    const deps = serverCompiledDeps(root);
    for (const dep of deps) {
      const manifest = JSON.parse(readFileSync(join(dep.dir, "package.json"), "utf-8")) as {
        exports?: Record<string, { import?: string }>;
        main?: string;
      };
      const declaredEntry = manifest.exports?.["."]?.import ?? manifest.main;
      expect(declaredEntry, `${dep.name}: package.json declares no runtime entry`).toBeTruthy();
      expect(dep.distEntry.replaceAll("\\", "/")).toBe((declaredEntry ?? "").replace(/^\.\//, ""));
    }
    const distByPackage = new Map(deps.map((dep) => [dep.name, dep.distEntry]));
    expect(distByPackage.get("@notebook/infra-llm")).toBe("dist/index.mjs");
    expect(distByPackage.get("@notebook/infra-vault")).toBe("dist/index.mjs");
  });
});

/**
 * T3.14 (P16) / T3.22 (P24) fixtures: a minimal on-disk workspace mirroring
 * the real package layout (manifest, build configs, src tree, compiled dist)
 * so the real stat/walk defaults run without shelling out. Source files and
 * directories are pinned older than dist, so the first pass is fresh by
 * construction and any second pass isolates the mutation under test.
 */

const FIXTURE_SOURCE_MTIME_MS = Date.UTC(2020, 0, 1);
const FIXTURE_DIST_MTIME_MS = FIXTURE_SOURCE_MTIME_MS + 60_000;
const FIXTURE_STALE_MTIME_MS = FIXTURE_SOURCE_MTIME_MS + 120_000;

const fixtureRoots: string[] = [];

afterEach(() => removeTempRoots(fixtureRoots), 120_000);

function setMtimeMs(path: string, mtimeMs: number): void {
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

/** Runtime @notebook/* deps of the server: one fixture package dir each. */
function serverDeclaredDepDirNames(root: string): string[] {
  const manifest = JSON.parse(readFileSync(join(root, "apps", "server", "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith("@notebook/"))
    .map((name) => name.slice("@notebook/".length));
}

function createFreshnessFixtureRoot(): string {
  const root = makeTempRoot(fixtureRoots, "notebench-freshness-");
  for (const dirName of serverDeclaredDepDirNames(process.cwd())) {
    const dir = join(root, "packages", dirName);
    const srcDir = join(dir, "src");
    const nestedDir = join(srcDir, "nested");
    const main = dirName === "infra-llm" || dirName === "infra-vault" ? "./dist/index.mjs" : "./dist/index.js";
    const inputs: string[] = [];
    mkdirSync(nestedDir, { recursive: true });
    inputs.push(srcDir, nestedDir);
    writeFileSync(join(srcDir, "index.ts"), "export const value = 1;\n");
    writeFileSync(join(nestedDir, "deep.ts"), "export const deep = 1;\n");
    inputs.push(join(srcDir, "index.ts"), join(nestedDir, "deep.ts"));
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ name: `@notebook/${dirName}`, main, exports: { ".": { import: main } } }, null, 2)}\n`
    );
    inputs.push(join(dir, "package.json"));
    if (dirName !== "infra-llm") {
      // infra-llm ships without tsdown.config.ts (tsdown defaults), as in-tree.
      writeFileSync(join(dir, "tsdown.config.ts"), "export default {};\n");
      inputs.push(join(dir, "tsdown.config.ts"));
    }
    writeFileSync(join(dir, "tsconfig.json"), "{}\n");
    inputs.push(join(dir, "tsconfig.json"));
    const distFile = join(dir, main.replace(/^\.\//, ""));
    mkdirSync(dirname(distFile), { recursive: true });
    writeFileSync(distFile, "export {};\n");
    for (const input of inputs) {
      setMtimeMs(input, FIXTURE_SOURCE_MTIME_MS);
    }
    setMtimeMs(distFile, FIXTURE_DIST_MTIME_MS);
  }
  return root;
}

describe("ticket 03: freshness inputs include build configs (T3.14)", () => {
  it("invalidates when a package's tsdown.config.ts changes", async () => {
    const root = createFreshnessFixtureRoot();
    const built: string[] = [];
    const runBuild = (dep: CompiledDep): void => {
      built.push(dep.name);
    };
    const first = await ensureServerFreshness(root, { runBuild });
    expect(first.rebuilt).toEqual([]);
    expect(first.skipped).toHaveLength(serverDeclaredDepDirNames(process.cwd()).length);
    const configFile = join(root, "packages", "logger", "tsdown.config.ts");
    writeFileSync(configFile, "export default { minify: true };\n");
    setMtimeMs(configFile, FIXTURE_STALE_MTIME_MS);
    built.length = 0;
    const second = await ensureServerFreshness(root, { runBuild });
    expect(second.rebuilt).toEqual(["@notebook/logger"]);
  });
});

describe("ticket 03: freshness notices deletions and enumeration failures (T3.22)", () => {
  it("invalidates when a nested source file is deleted", async () => {
    const root = createFreshnessFixtureRoot();
    const built: string[] = [];
    const runBuild = (dep: CompiledDep): void => {
      built.push(dep.name);
    };
    const first = await ensureServerFreshness(root, { runBuild });
    expect(first.rebuilt).toEqual([]);
    rmSync(join(root, "packages", "contracts", "src", "nested", "deep.ts"));
    built.length = 0;
    const second = await ensureServerFreshness(root, { runBuild });
    expect(second.rebuilt).toEqual(["@notebook/contracts"]);
  });

  it("invalidates when a direct source file is deleted", async () => {
    const root = createFreshnessFixtureRoot();
    const built: string[] = [];
    const runBuild = (dep: CompiledDep): void => {
      built.push(dep.name);
    };
    const first = await ensureServerFreshness(root, { runBuild });
    expect(first.rebuilt).toEqual([]);
    rmSync(join(root, "packages", "logger", "src", "index.ts"));
    built.length = 0;
    const second = await ensureServerFreshness(root, { runBuild });
    expect(second.rebuilt).toEqual(["@notebook/logger"]);
  });

  it("rebuilds a package whose source tree cannot be enumerated", async () => {
    const root = createFreshnessFixtureRoot();
    rmSync(join(root, "packages", "domain-ops", "src"), { recursive: true, force: true });
    const result = await ensureServerFreshness(root, {
      runBuild: () => {},
    });
    expect(result.rebuilt).toEqual(["@notebook/domain-ops"]);
    expect(result.skipped).toHaveLength(serverDeclaredDepDirNames(process.cwd()).length - 1);
  });

  it("forces a rebuild when input enumeration rejects", async () => {
    const root = makeTempRoot(fixtureRoots, "notebench-freshness-");
    const deps = serverCompiledDeps(root);
    const distMtimes = new Map(deps.map((dep) => [join(dep.dir, dep.distEntry), FIXTURE_DIST_MTIME_MS]));
    const result = await ensureServerFreshness(root, {
      statMtimeMs: (path) => Promise.resolve(distMtimes.get(path) ?? null),
      listFilesRecursive: () => Promise.reject(new Error("EACCES: input walk failed")),
      runBuild: () => {},
    });
    expect(result.rebuilt).toEqual(deps.map((dep) => dep.name));
  });
});
