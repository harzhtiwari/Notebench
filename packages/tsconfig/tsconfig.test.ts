import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("@notebook/tsconfig package integrity", () => {
  const tsconfigDir = resolve(__dirname);

  it("exports package.json with correct subpath exports", () => {
    const pkgPath = resolve(tsconfigDir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("@notebook/tsconfig");
    expect(pkg.private).toBe(true);
    expect(pkg.exports["./base.json"]).toBe("./base.json");
    expect(pkg.exports["./build.json"]).toBe("./build.json");
    expect(pkg.exports["./nextjs.json"]).toBe("./nextjs.json");
  });

  it("base.json specifies NodeNext and hyper-strict flags", () => {
    const basePath = resolve(tsconfigDir, "base.json");
    expect(existsSync(basePath)).toBe(true);

    const base = JSON.parse(readFileSync(basePath, "utf-8"));
    const opts = base.compilerOptions;

    expect(opts.target).toBe("ES2022");
    expect(opts.module).toBe("NodeNext");
    expect(opts.moduleResolution).toBe("NodeNext");
    expect(opts.strict).toBe(true);
    expect(opts.verbatimModuleSyntax).toBe(true);
    expect(opts.noUncheckedIndexedAccess).toBe(true);
    expect(opts.exactOptionalPropertyTypes).toBe(true);
    expect(opts.noPropertyAccessFromIndexSignature).toBe(true);
    expect(opts.isolatedModules).toBe(true);
  });

  it("build.json extends base.json and configures declarations", () => {
    const buildPath = resolve(tsconfigDir, "build.json");
    expect(existsSync(buildPath)).toBe(true);

    const build = JSON.parse(readFileSync(buildPath, "utf-8"));
    expect(build.extends).toBe("./base.json");
    expect(build.compilerOptions.declaration).toBe(true);
    expect(build.compilerOptions.declarationMap).toBe(true);
    expect(build.compilerOptions.rootDir).toBe("src");
    expect(build.compilerOptions.outDir).toBe("dist");
    expect(build.exclude).toContain("**/*.test.ts");
  });

  it("nextjs.json configures Next.js compiler plugins and DOM libraries", () => {
    const nextPath = resolve(tsconfigDir, "nextjs.json");
    expect(existsSync(nextPath)).toBe(true);

    const next = JSON.parse(readFileSync(nextPath, "utf-8"));
    expect(next.extends).toBe("./base.json");
    expect(next.compilerOptions.moduleResolution).toBe("bundler");
    expect(next.compilerOptions.jsx).toBe("preserve");
    expect(next.compilerOptions.noEmit).toBe(true);
    expect(next.compilerOptions.plugins).toEqual([{ name: "next" }]);
  });
});
