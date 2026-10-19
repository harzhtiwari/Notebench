const THEME_STORAGE_KEY = "notebench_theme";

export type ThemeMode = "light" | "dark" | "system";

const isThemeMode = (value: string | null): value is ThemeMode =>
  value !== null && ["light", "dark", "system"].includes(value);

/**
Retrieves the currently saved theme preference, defaulting to 'system'.
*/
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

/**
Applies the specified theme to the DOM document element and persists to localStorage.
Fulfills PRD 0.1 Requirement C3.
*/
export function applyTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);

  const root = document.documentElement;

  if (theme === "dark") {
    root.classList.add("dark");
    root.dataset["theme"] = "dark";
  } else if (theme === "light") {
    root.classList.remove("dark");
    root.dataset["theme"] = "light";
  } else {
    // Follow system preference
    const isDark = globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      root.classList.add("dark");
      root.dataset["theme"] = "dark";
    } else {
      root.classList.remove("dark");
      root.dataset["theme"] = "light";
    }
  }
}
