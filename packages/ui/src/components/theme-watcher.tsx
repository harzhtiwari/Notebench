"use client";

import { useEffect } from "react";
import { getStoredTheme, applyTheme } from "../lib/theme.js";

export function ThemeWatcher() {
  useEffect(() => {
    // 1. Initial client-side synchronization with stored preference or system default
    applyTheme(getStoredTheme());

    // 2. React dynamically to OS system appearance switches
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", handler);
    return () => {
      media.removeEventListener("change", handler);
    };
  }, []);

  return null;
}
