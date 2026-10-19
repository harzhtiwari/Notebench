// @vitest-environment happy-dom
import { runInThisContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme } from "@notebench/ui";

import { THEME_STORAGE_KEY, buildThemeBootScript } from "./theme-boot";

/**
The boot script ships as an inline <script> inside the static HTML and runs
before the first paint. Executing the exact string here exercises the same
code path the browser runs.
*/
function runBootScript(): void {
  runInThisContext(buildThemeBootScript());
}

function systemPrefersDark(isDark: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ media: query, matches: isDark }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.localStorage.clear();
  delete document.documentElement.dataset["theme"];
  document.documentElement.classList.remove("dark");
});

describe("theme boot script (pre-paint, static export)", () => {
  it("uses the documented storage key, embedded via JSON", () => {
    expect(THEME_STORAGE_KEY).toBe("notebench_theme");
    expect(buildThemeBootScript()).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("shares its storage key with @notebench/ui writes (no silent drift)", () => {
    applyTheme("dark");
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("uses the same storage key @notebench/ui reads (no silent drift)", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("applies a stored dark preference and mirrors the dark class", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    systemPrefersDark(false);

    runBootScript();

    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies a stored light preference and clears a stale dark class", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.documentElement.classList.add("dark");
    systemPrefersDark(true);

    runBootScript();

    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to the OS preference when nothing is stored", () => {
    systemPrefersDark(true);
    runBootScript();
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    systemPrefersDark(false);
    delete document.documentElement.dataset["theme"];
    runBootScript();
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("treats unknown stored values as the system preference", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "banana");
    systemPrefersDark(true);

    runBootScript();

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("survives a blocked localStorage without throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("storage blocked");
      },
    });
    systemPrefersDark(true);

    expect(() => { runBootScript(); }).not.toThrow();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("defaults to light when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);

    runBootScript();

    expect(document.documentElement.dataset["theme"]).toBe("light");
  });
});
