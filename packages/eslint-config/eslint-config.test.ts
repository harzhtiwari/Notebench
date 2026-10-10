import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("@notebook/eslint-config package integrity", () => {
  const eslintConfigDir = resolve(__dirname);

  it("exports package.json with flat config subpath exports", () => {
    const pkgPath = resolve(eslintConfigDir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("@notebook/eslint-config");
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe("module");
    expect(pkg.exports["."]).toBe("./src/index.js");
    expect(pkg.exports["./base"]).toBe("./src/base.js");
    expect(pkg.exports["./react"]).toBe("./src/react.js");
    expect(pkg.exports["./next"]).toBe("./src/next.js");
  });

  it("exports valid baseConfig flat config with hyper-strict rules", async () => {
    const indexPath = resolve(eslintConfigDir, "src/index.js");
    expect(existsSync(indexPath)).toBe(true);

    const { baseConfig } = await import(indexPath);
    expect(Array.isArray(baseConfig)).toBe(true);

    // Find our custom typescript rules block
    const tsRuleBlock = baseConfig.find(
      (c: Record<string, unknown>) =>
        typeof c === "object" &&
        c !== null &&
        "rules" in c &&
        typeof c.rules === "object" &&
        c.rules !== null &&
        "tsdoc/syntax" in c.rules
    ) as { rules: Record<string, unknown[]> } | undefined;
    expect(tsRuleBlock).toBeDefined();
    const getSeverity = (rule: unknown) => (Array.isArray(rule) ? rule[0] : rule);
    expect(getSeverity(tsRuleBlock?.rules["@typescript-eslint/no-explicit-any"])).toBe("error");
    expect(getSeverity(tsRuleBlock?.rules["@typescript-eslint/no-floating-promises"])).toBe("error");
    expect(getSeverity(tsRuleBlock?.rules["@typescript-eslint/no-unused-vars"])).toBe("error");
    // Find security and unicorn plugin blocks
    const securityBlock = baseConfig.find(
      (c: Record<string, unknown>) =>
        typeof c === "object" &&
        c !== null &&
        "plugins" in c &&
        typeof c.plugins === "object" &&
        c.plugins !== null &&
        "security" in c.plugins
    ) as { rules: Record<string, unknown> } | undefined;
    expect(securityBlock).toBeDefined();
    expect(securityBlock?.rules["security/detect-eval-with-expression"]).toBeDefined();

    const unicornBlock = baseConfig.find(
      (c: Record<string, unknown>) =>
        typeof c === "object" &&
        c !== null &&
        "plugins" in c &&
        typeof c.plugins === "object" &&
        c.plugins !== null &&
        "unicorn" in c.plugins
    ) as { rules: Record<string, unknown> } | undefined;
    expect(unicornBlock).toBeDefined();
    expect(unicornBlock?.rules["unicorn/prefer-node-protocol"]).toBeDefined();
  }, 90000);

  it("exports reactConfig and nextConfig extending baseConfig", async () => {
    const indexPath = resolve(eslintConfigDir, "src/index.js");
    const { reactConfig, nextConfig } = await import(indexPath);

    expect(Array.isArray(reactConfig)).toBe(true);
    expect(Array.isArray(nextConfig)).toBe(true);

    const reactBlock = reactConfig.find(
      (c: Record<string, unknown>) =>
        typeof c === "object" &&
        c !== null &&
        "plugins" in c &&
        typeof c.plugins === "object" &&
        c.plugins !== null &&
        "react" in c.plugins
    ) as { rules: Record<string, unknown> } | undefined;
    expect(reactBlock).toBeDefined();
    expect(reactBlock?.rules["react/jsx-no-target-blank"]).toBe("error");
  }, 45000);
});
