import { describe, expect, it, vi } from "vitest";

/**
Ticket 05 RED slice 2 — web config duality (spec 5.10 + 7.2).

Seam under test:
- (A) loaded NextConfig object observed via dynamic import under an
  env matrix (production vs sidecar). No compiler boot, no filesystem
  writes outside the import itself.

Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
*/
async function loadWebConfig(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const module = (await import("../../../apps/web/next.config.js")) as {
    default: Record<string, unknown>;
  };
  return module.default;
}

describe("ticket 05: web config carries the generated tsconfig branch", () => {
  const DIST_DIR_ENV = "NOTEBENCH_WEB_DIST_DIR";
  const DIST_DIR_ENV_ALIAS = "NB_WEB_DIST_DIR";
  const TSCONFIG_ENV = "NOTEBENCH_WEB_TSCONFIG_PATH";
  const TSCONFIG_ENV_ALIAS = "NB_WEB_TSCONFIG_PATH";

  it("keeps the production export branch byte-identical without sidecar env", async () => {
    Reflect.deleteProperty(process.env, DIST_DIR_ENV);
    Reflect.deleteProperty(process.env, DIST_DIR_ENV_ALIAS);
    Reflect.deleteProperty(process.env, TSCONFIG_ENV);
    Reflect.deleteProperty(process.env, TSCONFIG_ENV_ALIAS);
    const config = await loadWebConfig();
    expect(config["output"]).toBe("export");
    expect(config["distDir"]).toBe("out");
    const typescript = config["typescript"] as Record<string, unknown> | undefined;
    expect(typescript?.["tsconfigPath"]).toBeUndefined();
  });

  it("selects the namespaced tsconfig path under sidecar env", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    process.env[TSCONFIG_ENV] = "/tmp/build/ns/tsconfig.sidecar.json";
    try {
      const config = await loadWebConfig();
      expect(config["output"]).toBeUndefined();
      const typescript = config["typescript"] as Record<string, unknown> | undefined;
      expect(typeof typescript?.["tsconfigPath"]).toBe("string");
    } finally {
      Reflect.deleteProperty(process.env, DIST_DIR_ENV);
      Reflect.deleteProperty(process.env, TSCONFIG_ENV);
    }
  });
});
