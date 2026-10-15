import { parseRoute, type ScreenId } from "./router";

export interface ScreenRegistration {
  eager: boolean;
  reason: string;
}

/**
 * Explicit screen registry: every product screen is listed here
 * with its loading policy. All navigation-critical screens load eagerly —
 * the app is small and any first-visit chunk wait on tab switches is rejected.
 * Lazy loading is accepted nowhere today; when a deferred screen lands it must
 * be registered here with `eager: false` and the accepted cost documented in
 * `reason`.
 */
export const SCREEN_REGISTRY: Record<ScreenId, ScreenRegistration> = {
  setup: { eager: true, reason: "navigation-critical: first-run gate, no first-visit wait" },
  login: { eager: true, reason: "navigation-critical: passcode gate, no first-visit wait" },
  "not-found": { eager: true, reason: "navigation-critical: deep-link shell must render instantly" },
};

export function resolveScreen(path: string): ScreenId {
  return parseRoute(path).screen;
}
