import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveWebCompilerEnv } from "../src/config-duality.js";

/**
 * Ticket 05 RED slice 1 — web compiler duality resolver.
 *
 * Seams under test (public boundaries only):
 * - (B) config-duality resolver observed via return values / throws
 *   (env in, resolved paths out). No filesystem, no Next import.
 *
 * Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
 */
describe("ticket 05: web compiler duality resolver", () => {
  it("resolves absolute distDir with turbopack default and derived tsconfig under the build dir", () => {
    expect(
      resolveWebCompilerEnv(
        {
          NOTEBENCH_WEB_DIST_DIR: "/repo/.tmp/build/ns/web-dist",
        },
        "/repo/.tmp/build/ns"
      )
    ).toEqual({
      distDir: "/repo/.tmp/build/ns/web-dist",
      tsconfigPath: join("/repo/.tmp/build/ns", "tsconfig.dev.json"),
      bundler: "turbopack",
    });
  });

  it("prefers canonical env over NB_ aliases (spec 7.2)", () => {
    expect(
      resolveWebCompilerEnv(
        {
          NOTEBENCH_WEB_DIST_DIR: "/repo/.tmp/build/a",
          NB_WEB_DIST_DIR: "/repo/.tmp/build/z",
          NOTEBENCH_WEB_TSCONFIG_PATH: "/repo/.tmp/build/a/tsconfig.json",
          NB_WEB_TSCONFIG_PATH: "/repo/.tmp/build/z/tsconfig.json",
          NOTEBENCH_WEB_DEV_BUNDLER: "turbopack",
          NB_WEB_DEV_BUNDLER: "webpack",
        },
        "/repo/.tmp/build/a"
      )
    ).toEqual({
      distDir: "/repo/.tmp/build/a",
      tsconfigPath: "/repo/.tmp/build/a/tsconfig.json",
      bundler: "turbopack",
    });
  });

  it("fails fast on missing distDir, relative paths, or unknown bundler", () => {
    expect(() => resolveWebCompilerEnv({}, "/repo/.tmp/build/ns")).toThrow(
      /NOTEBENCH_WEB_DIST_DIR/
    );
    expect(() =>
      resolveWebCompilerEnv(
        { NOTEBENCH_WEB_DIST_DIR: "relative/path" },
        "/repo/.tmp/build/ns"
      )
    ).toThrow(/absolute/);
    expect(() =>
      resolveWebCompilerEnv(
        {
          NOTEBENCH_WEB_DIST_DIR: "/repo/.tmp/build/ns/web-dist",
          NOTEBENCH_WEB_TSCONFIG_PATH: "relative/tsconfig.json",
        },
        "/repo/.tmp/build/ns"
      )
    ).toThrow(/absolute/);
    expect(() =>
      resolveWebCompilerEnv(
        {
          NOTEBENCH_WEB_DIST_DIR: "/repo/.tmp/build/ns/web-dist",
          NOTEBENCH_WEB_DEV_BUNDLER: "rspack",
        },
        "/repo/.tmp/build/ns"
      )
    ).toThrow(/bundler/);
  });
});
