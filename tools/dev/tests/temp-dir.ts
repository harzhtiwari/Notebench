import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
Shared temp-root lifecycle for tools/dev suites (ticket 08 hygiene).

Windows cannot remove a directory while a reaped child still holds it as
cwd, and parallel suites keep locks longer: removal retries transient lock
errors with a generous budget before giving up.
*/
export function makeTempRoot(roots: string[], prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

const RETRYABLE_REMOVE_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);

export async function removeTempRoots(roots: string[]): Promise<void> {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir === undefined) break;
    await removeWithRetries(dir);
  }
}

async function removeWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code !== undefined && RETRYABLE_REMOVE_CODES.has(code) && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}

/**
Push-to-array collector for injected `logLine` seams: suites assert on
the collected lines instead of teeing to the console.
*/
export function silentLogs(): { lines: string[]; logLine: (line: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    logLine: (line: string) => {
      lines.push(line);
    },
  };
}
