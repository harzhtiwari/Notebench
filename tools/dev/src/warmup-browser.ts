import type { UiProbeResult } from "./warmup.js";

/**
 * Headless-browser warm-up probe for the dev orchestrator (ticket 07,
 * spec 5.11). Named by the stable app-mounted marker plus a screen control:
 * ready is reported only after the app really mounted, never for
 * server-rendered HTML alone.
 *
 * The browser automation dependency is imported lazily (inside the probe, on
 * first ui-level run) so route-level runs and unit tests never load browser
 * binaries. API pinned against the installed @playwright/test 1.64.0 shipped
 * types (`chromium.launch`, `page.waitForSelector`).
 */

/** Marker flipped by the app shell after real mount (see app-root). */
export const APP_MOUNTED_SELECTOR = '[data-app-mounted="true"]';

/**
 * Screen controls proving a screen rendered, not just the shell: the setup
 * form on first run, the deep-link shell otherwise. The setup branch is
 * scoped to the stable form testid so an arbitrary form can never satisfy
 * the gate; at `/` the probe proves the deep-link shell rendered.
 */
export const SCREEN_CONTROL_SELECTOR =
  'form[data-testid="setup-form"], [data-testid="route-not-found"]';

export interface BrowserProbeOptions {
  /** Per-attempt budget for load + marker + control (default 30 s). */
  timeoutMs?: number | undefined;
}

/**
 * Drive headless Chromium at the web origin and observe the mounted marker
 * plus a screen control. Throws on launch or non-timeout navigation failure
 * (the warmup gate converts it to exit-5 diagnostics); a navigation or
 * marker/control budget expiry is a fresh not-mounted observation, never a
 * throw (P21). Cleanup close errors never mask the probe outcome.
 */
export async function probeAppMounted(
  webOrigin: string,
  options?: BrowserProbeOptions | undefined
): Promise<UiProbeResult> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    try {
      try {
        await page.goto(webOrigin, { timeout: timeoutMs });
        await page.waitForSelector(APP_MOUNTED_SELECTOR, { timeout: timeoutMs });
      } catch (error: unknown) {
        if (isTimeoutError(error)) return { mounted: false, screenControl: null };
        throw error;
      }
      const control = await page.$(SCREEN_CONTROL_SELECTOR);
      if (control === null) return { mounted: true, screenControl: null };
      const testid = await control.getAttribute("data-testid");
      if (testid !== null) return { mounted: true, screenControl: `testid:${testid}` };
      const tag = await control.evaluate((node: unknown): string => {
        if (typeof node === "object" && node !== null) {
          const tagName: unknown = (node as { tagName?: unknown }).tagName;
          if (typeof tagName === "string") return tagName.toLowerCase();
        }
        return "element";
      });
      return { mounted: true, screenControl: tag };
    } finally {
      await closeQuietly(() => page.close());
    }
  } finally {
    await closeQuietly(() => browser.close());
  }
}

/** Selector/navigation budget expiry is an observation, not a probe failure. */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

/** A failing close must never mask the probe outcome (P21). */
async function closeQuietly(close: () => Promise<void>): Promise<void> {
  try {
    await close();
  } catch {
    return;
  }
}
