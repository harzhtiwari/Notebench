import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSidecarTsconfig } from "../src/config-duality.js";

/**
 * Ticket 05 RED slice 3 — generated sidecar tsconfig writer.
 *
 * Seam under test:
 * - (B) writer observed via real files under a temp build dir (exists,
 *   parses, extends the web tsconfig, never inside the web package).
 */
describe("ticket 05: generated sidecar tsconfig", () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop() as string;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the generated config under the build dir extending the web tsconfig", () => {
    const buildDir = mkdtempSync(join(tmpdir(), "notebench-t05-"));
    tempRoots.push(buildDir);
    const webDir = join(process.cwd(), "apps", "web");
    const tsconfigPath = ensureSidecarTsconfig(buildDir, webDir);
    expect(tsconfigPath).toBe(join(buildDir, "tsconfig.dev.json"));
    expect(existsSync(tsconfigPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(tsconfigPath, "utf-8")) as {
      extends?: unknown;
    };
    expect(typeof parsed["extends"]).toBe("string");
    // The generated file lives outside the web package.
    expect(tsconfigPath.startsWith(webDir)).toBe(false);
  });

  it("fails fast on relative buildDir or webDir", () => {
    expect(() => ensureSidecarTsconfig("relative/build", "/abs/web")).toThrow(
      /absolute/
    );
    expect(() => ensureSidecarTsconfig("/abs/build", "relative/web")).toThrow(
      /absolute/
    );
  });
});
