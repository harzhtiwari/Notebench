import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  isIsolatedCompilerPath,
  resolveWebCompilerEnv,
} from "../src/config-duality.js";

/**
Ticket 05 slice 4 — compiler isolation proof (spec 5.5 + 5.10).

Seams under test (public boundaries only):
- (B) resolver + isolation predicate observed via return values.
- (A) loaded NextConfig object observed via dynamic import: dev never
  selects the production export contract or location, production never
  selects the sidecar branch.

Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
*/
async function loadWebConfig(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const module = (await import("../../../apps/web/next.config.js")) as {
    default: Record<string, unknown>;
  };
  return module.default;
}

describe("ticket 05: dev compiler never touches production artifacts", () => {
  const DIST_DIR_ENV = "NOTEBENCH_WEB_DIST_DIR";
  const TSCONFIG_ENV = "NOTEBENCH_WEB_TSCONFIG_PATH";

  it("resolves dev outputs under the namespaced build dir, outside the web package", () => {
    const webDir = path.join(process.cwd(), "apps", "web");
    const buildDir = path.join(process.cwd(), ".tmp", "build", "proof-ns");
    const resolved = resolveWebCompilerEnv(
      {
        [DIST_DIR_ENV]: path.join(buildDir, "web-dist"),
        [TSCONFIG_ENV]: path.join(buildDir, "tsconfig.dev.json"),
      },
      buildDir
    );
    expect(isIsolatedCompilerPath(resolved.distDir, webDir, buildDir)).toBe(true);
    expect(isIsolatedCompilerPath(resolved.tsconfigPath, webDir, buildDir)).toBe(true);
    // The production export location is never an isolated dev output.
    expect(
      isIsolatedCompilerPath(path.join(webDir, "out"), webDir, buildDir)
    ).toBe(false);
  });

  it("rejects dev outputs staged inside the web package", () => {
    const webDir = path.join(process.cwd(), "apps", "web");
    const buildDir = path.join(process.cwd(), ".tmp", "build", "proof-ns");
    expect(
      isIsolatedCompilerPath(path.join(webDir, ".next"), webDir, buildDir)
    ).toBe(false);
    expect(
      isIsolatedCompilerPath(path.join(webDir, "out"), webDir, buildDir)
    ).toBe(false);
  });

  it("loads no production export contract under sidecar env and no sidecar branch without it", async () => {
    const webDir = path.join(process.cwd(), "apps", "web");
    process.env[DIST_DIR_ENV] = path.join(process.cwd(), ".tmp", "build", "proof-ns", "web-dist");
    process.env[TSCONFIG_ENV] = path.join(process.cwd(), ".tmp", "build", "proof-ns", "tsconfig.dev.json");
    try {
      const devConfig = await loadWebConfig();
      expect(devConfig["output"]).toBeUndefined();
      const distDir = devConfig["distDir"];
      expect(typeof distDir).toBe("string");
      const resolvedDist = path.join(webDir, distDir as string);
      const proofBuildDir = path.join(process.cwd(), ".tmp", "build", "proof-ns");
      expect(isIsolatedCompilerPath(resolvedDist, webDir, proofBuildDir)).toBe(true);
    } finally {
      Reflect.deleteProperty(process.env, DIST_DIR_ENV);
      Reflect.deleteProperty(process.env, TSCONFIG_ENV);
    }
    const prodConfig = await loadWebConfig();
    expect(prodConfig["output"]).toBe("export");
    expect(prodConfig["distDir"]).toBe("out");
  });
});
