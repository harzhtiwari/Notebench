import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface PackageJson {
  scripts?: Record<string, string>;
}

function readRootPackageJson(): PackageJson {
  const raw = readFileSync(join(ROOT, "package.json"), "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("root package.json did not parse to an object");
  }
  return parsed as PackageJson;
}

/** Extract the scripts/<name>.sh token referenced by a package.json script. */
function referencedShellScript(command: string): string | undefined {
  const match = /scripts\/[A-Za-z0-9_.-]+\.sh/.exec(command);
  return match ? match[0] : undefined;
}

describe("ticket-26 package.json backup/restore scripts", () => {
  it("backup script resolves to an existing file", () => {
    const pkg = readRootPackageJson();
    const command = pkg.scripts?.["backup"];
    expect(command).toBeDefined();
    const ref = referencedShellScript(command ?? "");
    expect(ref).toBeDefined();
    expect(existsSync(resolve(ROOT, ref ?? ""))).toBe(true);
  });

  it("restore script resolves to an existing file", () => {
    const pkg = readRootPackageJson();
    const command = pkg.scripts?.["restore"];
    expect(command).toBeDefined();
    const ref = referencedShellScript(command ?? "");
    expect(ref).toBeDefined();
    expect(existsSync(resolve(ROOT, ref ?? ""))).toBe(true);
  });

  it("canonical host scripts are self-contained bash with sha256 + online backup", () => {
    for (const name of ["backup.sh", "restore.sh"]) {
      const content = readFileSync(join(ROOT, "scripts", name), "utf-8");
      expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
    }
    const backup = readFileSync(join(ROOT, "scripts", "backup.sh"), "utf-8");
    expect(backup).toContain("backup-cli");
    expect(backup).toContain("sha256");
    const restore = readFileSync(join(ROOT, "scripts", "restore.sh"), "utf-8");
    expect(restore).toContain("sha256");
    expect(restore).toContain("verify");
  });

  it("host tarball rotation keeps 14-day window (union, never newest)", () => {
    const backup = readFileSync(join(ROOT, "scripts", "backup.sh"), "utf-8");
    const marker = "Rotating host archives";
    const rotation = backup.slice(backup.indexOf(marker));
    expect(backup.indexOf(marker)).toBeGreaterThan(-1);
    expect(rotation).toMatch(/mtime \+14|find.+14|RETENTION_WINDOW_DAYS|retentionDays/i);
  });
});

describe("ticket-26 release gate wiring (spec 9.10)", () => {
  it("release-gate script exists and covers every gate", () => {
    const gatePath = join(ROOT, "scripts", "release-gate.sh");
    expect(existsSync(gatePath)).toBe(true);
    const content = readFileSync(gatePath, "utf-8");
    for (const step of [
      "pnpm test",
      "pnpm typecheck",
      "pnpm lint",
      "pnpm guard",
      "lint:licenses",
      "rollback",
      "docker",
    ]) {
      expect(content).toContain(step);
    }
  });

  it("release workflow runs the gate before the changeset loop", () => {
    const workflowPath = join(ROOT, ".github", "workflows", "release.yml");
    expect(existsSync(workflowPath)).toBe(true);
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("release-gate");
    expect(content).toContain("changeset version");
    expect(content).toContain("changeset publish");
    expect(content.indexOf("release-gate")).toBeLessThan(
      content.indexOf("changeset publish")
    );
  });
});
