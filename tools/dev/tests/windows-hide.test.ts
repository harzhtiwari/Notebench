import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supervisedDetached } from "../src/spawn.js";

/**
 * Console-inheritance regression (user report: many <1s `node.exe` popups on
 * `pnpm dev`, screenshot title `C:\Program Files\nodejs\node...`).
 *
 * Windows rule enforced here:
 * - LEAF helpers (spawn no console-app descendants) MUST pass
 *   `windowsHide: true`, or they flash once themselves.
 *   → tools/dev/src/ports.ts (netstat/tasklist/lsof)
 * - MID-TREE supervisors (their subtree spawns console apps: Next.js
 *   compiler workers, pnpm→turbo→tsc tasks) MUST NOT hide. A hidden process
 *   has no console, so each non-hidden descendant gets a fresh VISIBLE
 *   console window → the popup storm.
 *   → tools/dev/src/spawn.ts (server/web supervisors)
 *   → tools/dev/src/freshness.ts (cmd.exe→pnpm→turbo build delegation)
 *
 * Correct seam note: these call sites hardcode the spawn options instead of
 * injecting them, so a static scan of the option literals is the seam that
 * exercises the real bug pattern.
 */

const ROOT = process.cwd();
const HIDE_RE = /windowsHide\s*:\s*true/;
const CALL_RE = /(?:execFileAsync|nodeSpawn)\s*\(/g;

function callsWithHide(source: string): number[] {
  const found: number[] = [];
  let m: RegExpExecArray | null;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(source)) !== null) {
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    if (HIDE_RE.test(source.slice(m.index, end + 1))) {
      let line = 1;
      for (let i = 0; i < m.index; i++) if (source[i] === "\n") line++;
      found.push(line);
    }
  }
  return found;
}

function callsWithoutHide(source: string): number[] {
  const missing: number[] = [];
  let m: RegExpExecArray | null;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(source)) !== null) {
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    if (!HIDE_RE.test(source.slice(m.index, end + 1))) {
      let line = 1;
      for (let i = 0; i < m.index; i++) if (source[i] === "\n") line++;
      missing.push(line);
    }
  }
  return missing;
}

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

describe("console inheritance: leaves hide, mid-tree supervisors share", () => {
  it("leaf helper ports.ts hides every console (netstat/tasklist/lsof)", () => {
    expect(callsWithoutHide(readSrc(join("tools", "dev", "src", "ports.ts")))).toEqual([]);
  });

  it("mid-tree spawn.ts shares the parent console (no hide flag)", () => {
    expect(callsWithHide(readSrc(join("tools", "dev", "src", "spawn.ts")))).toEqual([]);
  });

  it("mid-tree freshness.ts shares the parent console (no hide flag)", () => {
    expect(callsWithHide(readSrc(join("tools", "dev", "src", "freshness.ts")))).toEqual([]);
  });

  it("supervisedDetached keeps POSIX groups, never detaches on Windows", () => {
    // Research docs/research/2026-10-15/windows-console-flash.md §2-§4:
    // detached:true on win32 is DETACHED_PROCESS (own console) → grandchildren flash.
    expect(supervisedDetached("win32")).toBe(false);
    expect(supervisedDetached("linux")).toBe(true);
    expect(supervisedDetached("darwin")).toBe(true);
  });
});
