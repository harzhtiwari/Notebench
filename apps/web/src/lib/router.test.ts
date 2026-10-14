import { describe, expect, it } from "vitest";

import {
  createMemoryRouter,
  parseRoute,
  resolveAppPath,
  shouldInterceptNavigation,
} from "./router";

describe("owned history router (ticket 06 slice 1)", () => {
  it("parses the three merged screens plus unknown deep links", () => {
    expect(parseRoute("/").screen).toBe("home");
    expect(parseRoute("/dashboard").screen).toBe("dashboard");
    expect(parseRoute("/setup").screen).toBe("setup");
    expect(parseRoute("/notebook/nb-123").screen).toBe("not-found");
  });

  it("preserves query and hash on programmatic navigation without reload", () => {
    const router = createMemoryRouter("/");
    const views: Array<string> = [];
    router.subscribe((entry) => views.push(`${entry.path}${entry.search}${entry.hash}`));
    router.navigate("/dashboard?tab=notes#row-2");
    expect(router.current.path).toBe("/dashboard");
    expect(router.current.search).toBe("?tab=notes");
    expect(router.current.hash).toBe("#row-2");
    expect(views).toEqual(["/dashboard?tab=notes#row-2"]);
    expect(router.reloads).toBe(0);
  });

  it("supports native back/forward across loaded screens", () => {
    const router = createMemoryRouter("/");
    router.navigate("/dashboard");
    router.navigate("/setup");
    router.back();
    expect(router.current.path).toBe("/dashboard");
    router.forward();
    expect(router.current.path).toBe("/setup");
    expect(router.reloads).toBe(0);
  });

  it("leaves modifier-click, new-tab, external, download, and hash-anchor to the browser", () => {
    expect(
      shouldInterceptNavigation({ href: "/dashboard", button: 0, metaKey: true }),
    ).toBe(false);
    expect(shouldInterceptNavigation({ href: "/dashboard", target: "_blank" })).toBe(false);
    expect(shouldInterceptNavigation({ href: "https://example.com/x" })).toBe(false);
    expect(shouldInterceptNavigation({ href: "/dashboard", download: true })).toBe(false);
    expect(
      shouldInterceptNavigation({ href: "#row-2", currentPath: "/dashboard" }),
    ).toBe(false);
    expect(shouldInterceptNavigation({ href: "/setup" })).toBe(true);
  });

  it("claims relative in-shell links by resolving them against the current path", () => {
    expect(shouldInterceptNavigation({ href: "dashboard", currentPath: "/" })).toBe(true);
    expect(resolveAppPath("dashboard", "/")).toBe("/dashboard");
    expect(resolveAppPath("../setup", "/dashboard")).toBe("/setup");
    expect(resolveAppPath("setup", "/dashboard")).toBe("/setup");
  });

  it("treats same-screen hash-only changes as browser-native, query changes as owned", () => {
    expect(resolveAppPath("#row-2", "/dashboard")).toBeNull();
    expect(resolveAppPath("/dashboard#row-2", "/dashboard")).toBeNull();
    expect(resolveAppPath("/dashboard?tab=notes", "/dashboard")).toBe("/dashboard?tab=notes");
    expect(resolveAppPath("/setup#row-2", "/dashboard")).toBe("/setup#row-2");
  });
});
