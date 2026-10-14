import { describe, expect, it } from "vitest";

import { resolveScreen, SCREEN_REGISTRY } from "./screens";

describe("screen registry (ticket 06 slice 2)", () => {
  it("maps the merged routes to their screens", () => {
    expect(resolveScreen("/")).toBe("home");
    expect(resolveScreen("/dashboard")).toBe("dashboard");
    expect(resolveScreen("/setup")).toBe("setup");
  });

  it("loads every navigation-critical screen eagerly with a documented reason", () => {
    for (const id of ["home", "dashboard", "setup"] as const) {
      expect(SCREEN_REGISTRY[id].eager).toBe(true);
      expect(SCREEN_REGISTRY[id].reason.length).toBeGreaterThan(0);
    }
  });

  it("sends unknown deep links to the not-found shell, never to an API fallback", () => {
    expect(resolveScreen("/notebook/nb-123")).toBe("not-found");
    expect(resolveScreen("/settings/storage")).toBe("not-found");
  });
});
