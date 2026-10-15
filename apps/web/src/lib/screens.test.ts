import { describe, expect, it } from "vitest";

import { resolveScreen, SCREEN_REGISTRY } from "./screens";

describe("screen registry (setup-only, stubs removed)", () => {
  it("maps the setup and login routes to their screens", () => {
    expect(resolveScreen("/setup")).toBe("setup");
    expect(resolveScreen("/login")).toBe("login");
  });

  it("loads every navigation-critical screen eagerly with a documented reason", () => {
    for (const id of ["setup", "login", "not-found"] as const) {
      expect(SCREEN_REGISTRY[id].eager).toBe(true);
      expect(SCREEN_REGISTRY[id].reason.length).toBeGreaterThan(0);
    }
  });

  it("sends removed stubs and unknown deep links to the not-found shell, never to an API fallback", () => {
    expect(resolveScreen("/")).toBe("not-found");
    expect(resolveScreen("/dashboard")).toBe("not-found");
    expect(resolveScreen("/settings/storage")).toBe("not-found");
  });
});
