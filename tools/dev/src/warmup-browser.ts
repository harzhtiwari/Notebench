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
 * form on first run, the deep-link shell otherwise.
 */
export const SCREEN_CONTROL_SELECTOR = 'form, [data-testid="route-not-found"]';

export interface BrowserProbeOptions {
  /** Per-attempt budget for load + marker + control (default 30 s). */
  timeoutMs?: number | undefined;
}

/**
 * Drive headless Chromium at the web origin and observe the mounted marker
 * plus a screen control. Throws on launch/navigation failure (the warmup
 * gate converts it to exit-5 diagnostics); returns an unmounted observation
 * when the marker or control never appears in budget.
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
      await page.goto(webOrigin, { timeout: timeoutMs });
      await page.waitForSelector(APP_MOUNTED_SELECTOR, { timeout: timeoutMs });
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
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
