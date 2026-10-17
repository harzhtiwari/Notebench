import { readFileSync as fsReadFileSync } from "node:fs";
import { readFile as fsReadFile } from "node:fs/promises";

/**
 * Shared injected defaults for the dev orchestrator.
 *
 * Each value is the fallback used when a seam is not injected (`sleep`,
 * file reads, readiness probes). This module imports nothing from other
 * orchestrator modules, so every consumer can depend on it without cycles.
 */

/** Real timer sleep. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Real async UTF-8 file read (identity records, log reads). */
export async function defaultReadFile(path: string): Promise<string> {
  return fsReadFile(path, "utf-8");
}

/** Real sync UTF-8 file read (E2E port files). */
export function defaultReadFileSync(path: string): string {
  return fsReadFileSync(path, "utf-8");
}

/**
 * Status-only HTTP probe shared by the server health gate and the web
 * route gate: true for 2xx, false for any other status or a failed request.
 */
export async function defaultProbeHttp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
