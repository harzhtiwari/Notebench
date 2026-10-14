import { describe, it, expect } from "vitest";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const guardScript = join(here, "guard.ts");
const fixtures = join(here, "fixtures");

interface GuardResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGuard(cwd: string): Promise<GuardResult> {
  return new Promise((resolve) => {
    exec(`pnpm exec tsx "${guardScript}"`, { cwd, timeout: 90000 }, (error, stdout, stderr) => {
      const code =
        error && typeof error.code === "number" ? error.code : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

describe("guard UI discipline (ticket 03)", () => {
  it("passes the clean fixture", async () => {
    const r = await runGuard(join(fixtures, "guard-clean"));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  }, 120_000);

  it("fails a direct icon-library import in web [Check #12]", async () => {
    const r = await runGuard(join(fixtures, "guard-phosphor"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #12]");
    expect(r.stderr).toContain("icon-user");
  }, 120_000);

  it("fails a multi-route web component missing from the ui index [Check #13]", async () => {
    const r = await runGuard(join(fixtures, "guard-multiroute"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #13]");
    expect(r.stderr).toContain("Shared");
  }, 120_000);

  it("fails hand-edited generated tokens [Check #28]", async () => {
    const r = await runGuard(join(fixtures, "guard-tokens"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #28]");
    expect(r.stderr).toContain("tokens.css");
    expect(r.stderr).toContain("build_tokens.py");
  }, 120_000);
});
