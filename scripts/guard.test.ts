import { describe, expect, it } from "vitest";
import { exec } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const guardScript = join(here, "guard.ts");

// Test staging under .tmp/build/<namespace>/ per the disposable layout
// (check 35). Trees are rebuilt at the start of each test; a failed tree is
// left on disk until the next run so the "crime scene" stays inspectable.
const stageRoot = join(repoRoot, ".tmp", "build", "guard");

type FileMap = Record<string, string>;

const PAGE = `import * as React from "react";

export default function Page() {
  return <div>clean</div>;
}
`;

const UI_INDEX = `export * from "./lib/utils.js";
`;

const UTILS = `export function noop(): number {
  return 1;
}
`;

const UI_PACKAGE_JSON = `{
  "name": "fixture-ui",
  "main": "./dist/index.js",
  "exports": { ".": { "import": "./dist/index.js" } }
}
`;

const TOKEN_CSS = "/* fixture generated tokens */\n";
const TOKEN_MEDIA_CSS = "/* fixture generated media tokens */\n";
const TOKEN_TS = "/* fixture generated token map */\n";
const TOKEN_PRESET = "/* fixture generated tailwind preset */\n";
const TOKEN_JSON = "{}\n";
const TOKEN_PY = "# fixture\n";

const ICON_USER = `import * as React from "react";
import { X } from "@phosphor-icons/react/X";

export function IconUser() {
  return <X />;
}
`;

const SHARED = `import * as React from "react";

export function Shared() {
  return <div>shared</div>;
}
`;

function sharedImporter(): string {
  return `import * as React from "react";
import { Shared } from "../../components/Shared";

export function RoutePage() {
  return <Shared />;
}
`;
}

const BASE: FileMap = {
  "apps/web/src/app/page.tsx": PAGE,
  "packages/ui/src/index.ts": UI_INDEX,
  "packages/ui/src/lib/utils.ts": UTILS,
  "packages/ui/package.json": UI_PACKAGE_JSON,
  "docs/ui/tokens.css": TOKEN_CSS,
  "packages/ui/tokens.css": TOKEN_CSS,
  "docs/ui/tokens.media.css": TOKEN_MEDIA_CSS,
  "packages/ui/tokens.media.css": TOKEN_MEDIA_CSS,
  "docs/ui/tokens.ts": TOKEN_TS,
  "packages/ui/src/tokens.ts": TOKEN_TS,
  "docs/ui/tailwind.preset.cjs": TOKEN_PRESET,
  "packages/ui/tailwind.preset.cjs": TOKEN_PRESET,
  "docs/ui/tokens.json": TOKEN_JSON,
  "docs/ui/build_tokens.py": TOKEN_PY,
  "docs/ui/lint_tokens.py": TOKEN_PY,
  "docs/ui/check_contrast.py": TOKEN_PY,
};

function buildTree(name: string, extra: FileMap = {}, remove: string[] = []): string {
  const dir = join(stageRoot, name);
  rmSync(dir, { recursive: true, force: true });
  const files: FileMap = { ...BASE, ...extra };
  for (const rel of remove) delete files[rel];
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

interface GuardResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGuard(cwd: string): Promise<GuardResult> {
  return new Promise((resolve) => {
    exec(`pnpm exec tsx "${guardScript}"`, { cwd, timeout: 90000 }, (error, stdout, stderr) => {
      const code = error && typeof error.code === "number" ? error.code : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

describe("guard UI discipline (ticket 03)", () => {
  it("passes the clean tree", async () => {
    const r = await runGuard(buildTree("guard-clean"));
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  }, 120_000);

  it("fails a direct icon-library import in web [Check #12]", async () => {
    const dir = buildTree("guard-phosphor", {
      "apps/web/src/app/icon-user.tsx": ICON_USER,
    });
    const r = await runGuard(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #12]");
    expect(r.stderr).toContain("icon-user");
  }, 120_000);

  it("fails a multi-route web component missing from the ui index [Check #13]", async () => {
    const dir = buildTree("guard-multiroute", {
      "apps/web/src/app/dashboard/page.tsx": sharedImporter(),
      "apps/web/src/app/setup/page.tsx": sharedImporter(),
      "apps/web/src/components/Shared.tsx": SHARED,
    });
    const r = await runGuard(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #13]");
    expect(r.stderr).toContain("Shared");
  }, 120_000);

  it("passes a stray toolchain .tmp/test/ dir [Check #35]", async () => {
    const dir = buildTree("guard-tmp-test", {
      ".tmp/test/placeholder": "",
    });
    const r = await runGuard(dir);
    expect(r.code).toBe(0);
  }, 120_000);

  it("fails hand-edited generated tokens [Check #28]", async () => {
    const dir = buildTree(
      "guard-tokens",
      { "packages/ui/tokens.css": "/* hand-edited, not regenerated */\n" },
      ["docs/ui/build_tokens.py"]
    );
    const r = await runGuard(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[Check #28]");
    expect(r.stderr).toContain("tokens.css");
    expect(r.stderr).toContain("build_tokens.py");
  }, 120_000);
});
