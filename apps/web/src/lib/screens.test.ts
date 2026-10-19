import { describe, expect, it } from "vitest";

import { resolveScreen, SCREEN_REGISTRY } from "./screens";

describe("screen registry (dashboard + notebook registered)", () => {
  it("maps the setup, login, dashboard, and notebook routes to their screens", () => {
    expect(resolveScreen("/setup")).toBe("setup");
    expect(resolveScreen("/login")).toBe("login");
    expect(resolveScreen("/dashboard")).toBe("dashboard");
    expect(resolveScreen("/notebooks/nb-123")).toBe("notebook");
    expect(resolveScreen("/trash")).toBe("trash");
  });

  it("loads every navigation-critical screen eagerly with a documented reason", () => {
    for (const id of ["setup", "login", "dashboard", "notebook", "trash", "not-found"] as const) {
      expect(SCREEN_REGISTRY[id].eager).toBe(true);
      expect(SCREEN_REGISTRY[id].reason.length).toBeGreaterThan(0);
    }
  });

  it("sends removed stubs and unknown deep links to the not-found shell, never to an API fallback", () => {
    expect(resolveScreen("/")).toBe("not-found");
    expect(resolveScreen("/settings/storage")).toBe("not-found");
  });
});
