import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildNextDevArgv, resolveNextBin, resolveWebBundler } from "../src/composer.js";

/**
 * CLI cutover (open-design parity): the web child runs the real
 * `next dev` CLI instead of the programmatic compiler API, so the genuine
 * Next.js startup block, HMR, and compile output come from Next itself.
 * RED-first seam: pure argv/bin builders behind defaultCreateWebSpawn.
 */
describe("web child runs the real Next.js CLI", () => {
  it("resolves the CLI bin inside the web workspace", () => {
    expect(resolveNextBin("/repo/apps/web")).toBe(
      join("/repo/apps/web", "node_modules", "next", "dist", "bin", "next")
    );
  });

  it("builds an explicit webpack argv (opt-in legacy)", () => {
    expect(
      buildNextDevArgv({
        nextBin: "/repo/apps/web/node_modules/next/dist/bin/next",
        webDir: "/repo/apps/web",
        host: "127.0.0.1",
        port: 57571,
        bundler: "webpack",
      })
    ).toEqual([
      "/repo/apps/web/node_modules/next/dist/bin/next",
      "dev",
      "/repo/apps/web",
      "-H",
      "127.0.0.1",
      "-p",
      "57571",
      "--webpack",
    ]);
  });

  it("builds an explicit turbopack argv for the opt-in bundler", () => {
    const argv = buildNextDevArgv({
      nextBin: "/bin/next",
      webDir: "/repo/apps/web",
      host: "127.0.0.1",
      port: 3000,
      bundler: "turbopack",
    });
    expect(argv).toContain("--turbopack");
    expect(argv).not.toContain("--webpack");
    expect(argv).toContain("3000");
  });

  it("defaults to turbopack when no bundler env is set (webpack pages 500 under out-of-tree distDir)", () => {
    expect(resolveWebBundler({})).toBe("turbopack");
    expect(
      resolveWebBundler({ NOTEBENCH_WEB_DEV_BUNDLER: "webpack" })
    ).toBe("webpack");
    expect(resolveWebBundler({ NB_WEB_DEV_BUNDLER: "webpack" })).toBe("webpack");
  });
});
