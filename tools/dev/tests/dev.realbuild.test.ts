import { it, expect } from "vitest";
import { join } from "node:path";
import { defaultRunBuild } from "../src/freshness.js";

/**
 * Ticket 03 quarantine: the real-package rebuild through the platform
 * interpreter (Windows `cmd.exe` path).
 *
 * This test shells out to `pnpm --filter <pkg> build` (a full package build
 * inside vitest, up to 120 s). Run in parallel with the other orchestrator
 * suites it intermittently kills the vitest worker on Windows (fail-fast
 * `3221226505`, parallel-only, never solo), so it is opt-in: skipped unless
 * `NOTEBENCH_RUN_REAL_BUILD=1` is set. Default `pnpm test` stays parallel
 * and stable; verify explicitly and solo:
 *
 *   $env:NOTEBENCH_RUN_REAL_BUILD="1"; npx vitest run tools/dev/tests/dev.realbuild.test.ts
 *
 * Ticket 08 (stabilize) owns re-integration or a permanent serial slot.
 */
const runRealBuild = process.env["NOTEBENCH_RUN_REAL_BUILD"] === "1";

it.skipIf(!runRealBuild)(
  "rebuilds a real package through the platform interpreter (Windows cmd.exe path)",
  async () => {
    const root = process.cwd();
    await expect(
      defaultRunBuild(
        {
          name: "@notebook/logger",
          dir: join(root, "packages", "logger"),
          distEntry: join("dist", "index.js"),
          srcDir: join(root, "packages", "logger", "src"),
        },
        root
      )
    ).resolves.toBeUndefined();
  },
  120_000
);
