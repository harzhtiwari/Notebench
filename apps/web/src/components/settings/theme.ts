const THEME_STORAGE_KEY = "notebench_theme";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Retrieves the currently saved theme preference, defaulting to 'system'.
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined" || !window.localStorage) {
    return "system";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

/**
 * Applies the specified theme to the DOM document element and persists to localStorage.
 * Fulfills PRD 0.1 Requirement C3.
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.localStorage) {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }

  const root = document.documentElement;

  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // Follow system preference
    const isDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}
