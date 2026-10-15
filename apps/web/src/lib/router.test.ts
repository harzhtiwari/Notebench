import { describe, expect, it } from "vitest";

import {
  createMemoryRouter,
  parseRoute,
  resolveAppPath,
  shouldInterceptNavigation,
} from "./router";

describe("owned history router (setup-only, stubs removed)", () => {
  it("parses the setup and login screens plus unknown deep links", () => {
    expect(parseRoute("/setup").screen).toBe("setup");
    expect(parseRoute("/login").screen).toBe("login");
    expect(parseRoute("/").screen).toBe("not-found");
    expect(parseRoute("/dashboard").screen).toBe("not-found");
    expect(parseRoute("/notebook/nb-123").screen).toBe("not-found");
  });

  it("preserves query and hash on programmatic navigation without reload", () => {
    const router = createMemoryRouter("/setup");
    const views: Array<string> = [];
    router.subscribe((entry) => views.push(`${entry.path}${entry.search}${entry.hash}`));
    router.navigate("/setup?tab=notes#row-2");
    expect(router.current.path).toBe("/setup");
    expect(router.current.search).toBe("?tab=notes");
    expect(router.current.hash).toBe("#row-2");
    expect(views).toEqual(["/setup?tab=notes#row-2"]);
    expect(router.reloads).toBe(0);
  });

  it("supports native back/forward across loaded screens", () => {
    const router = createMemoryRouter("/setup");
    router.navigate("/notebook/nb-123");
    router.navigate("/setup?tab=notes");
    router.back();
    expect(router.current.path).toBe("/notebook/nb-123");
    router.forward();
    expect(router.current.path).toBe("/setup");
    expect(router.reloads).toBe(0);
  });

  it("leaves modifier-click, new-tab, external, download, and hash-anchor to the browser", () => {
    expect(
      shouldInterceptNavigation({ href: "/setup", button: 0, metaKey: true }),
    ).toBe(false);
    expect(shouldInterceptNavigation({ href: "/setup", target: "_blank" })).toBe(false);
    expect(shouldInterceptNavigation({ href: "https://example.com/x" })).toBe(false);
    expect(shouldInterceptNavigation({ href: "/setup", download: true })).toBe(false);
    expect(
      shouldInterceptNavigation({ href: "#row-2", currentPath: "/setup" }),
    ).toBe(false);
    expect(shouldInterceptNavigation({ href: "/notebook/nb-123" })).toBe(true);
  });

  it("claims relative in-shell links by resolving them against the current path", () => {
    expect(shouldInterceptNavigation({ href: "setup", currentPath: "/" })).toBe(true);
    expect(resolveAppPath("setup", "/")).toBe("/setup");
    expect(resolveAppPath("../setup", "/notebook/nb-123")).toBe("/setup");
    expect(resolveAppPath("setup", "/notebook/nb-123")).toBe("/notebook/setup");
  });

  it("treats same-screen hash-only changes as browser-native, query changes as owned", () => {
    expect(resolveAppPath("#row-2", "/setup")).toBeNull();
    expect(resolveAppPath("/setup#row-2", "/setup")).toBeNull();
    expect(resolveAppPath("/setup?tab=notes", "/setup")).toBe("/setup?tab=notes");
    expect(resolveAppPath("/setup#row-2", "/notebook/nb-123")).toBe("/setup#row-2");
  });
});
