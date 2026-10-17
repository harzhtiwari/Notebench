import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-3 (docs/Project/DEV_RUNTIME_BUG_REPORT.md §1): `warmup-browser.ts`
 * lazily `await import("@playwright/test")` for `--warmup ui`, but
 * tools/dev/package.json never declared it — resolution worked only by
 * walking up to the repo-root node_modules. A filtered/isolated install
 * (or removal of the root dep) turns the ui warmup into
 * ERR_MODULE_NOT_FOUND (exit 5) after the server and sidecar were spawned.
 *
 * The runtime import lives in `src/`, so the workspace package must declare
 * the dependency itself, pinned to the same range as the root manifest.
 */

const ROOT = process.cwd();

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

const manifest = JSON.parse(
  readFileSync(join(ROOT, "tools", "dev", "package.json"), "utf-8")
) as PackageManifest;

describe("tools/dev declares @playwright/test directly", () => {
  it("declares a non-empty range in dependencies or devDependencies", () => {
    const declared =
      manifest.dependencies?.["@playwright/test"] ??
      manifest.devDependencies?.["@playwright/test"];
    expect(typeof declared).toBe("string");
    expect(declared).toBeTruthy();
  });

  it("pins the same range as the root manifest (^1.64.0)", () => {
    const declared =
      manifest.dependencies?.["@playwright/test"] ??
      manifest.devDependencies?.["@playwright/test"];
    expect(declared).toBe("^1.64.0");
  });
});
