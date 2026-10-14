import { parseRoute, type ScreenId } from "./router";

export interface ScreenRegistration {
  eager: boolean;
  reason: string;
}

/**
 * Explicit screen registry (ticket 06): every product screen is listed here
 * with its loading policy. All three navigation-critical screens load eagerly —
 * the app is small and any first-visit chunk wait on tab switches is rejected.
 * Lazy loading is accepted nowhere today; when a deferred screen lands it must
 * be registered here with `eager: false` and the accepted cost documented in
 * `reason`.
 */
export const SCREEN_REGISTRY: Record<ScreenId, ScreenRegistration> = {
  home: { eager: true, reason: "navigation-critical: root landing, no first-visit wait" },
  dashboard: { eager: true, reason: "navigation-critical: primary workspace, no first-visit wait" },
  setup: { eager: true, reason: "navigation-critical: first-run gate, no first-visit wait" },
  "not-found": { eager: true, reason: "navigation-critical: deep-link shell must render instantly" },
};

export function resolveScreen(path: string): ScreenId {
  return parseRoute(path).screen;
}
