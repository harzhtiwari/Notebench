"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { SettingsPageId } from "@notebook/contracts";
import { SETTINGS_REGISTRY } from "@notebook/contracts";
import { SettingsRenderer } from "./SettingsRenderer";
import { applyTheme, getStoredTheme, type ThemeMode } from "./theme";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage?: SettingsPageId;
  onActionClick?: (settingId: string) => void;
}

const PAGES_CONFIG: Array<{ id: SettingsPageId; label: string }> = [
  { id: "account", label: "Account" },
  { id: "models", label: "Models & Keys" },
  { id: "preferences", label: "Preferences" },
  { id: "memory", label: "Memory" },
  { id: "storage", label: "Storage & Data" },
  { id: "privacy", label: "Privacy" },
  { id: "health", label: "Health" },
];

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  initialPage = "account",
  onActionClick,
}) => {
  const [activePage, setActivePage] = useState<SettingsPageId>(initialPage);

  // Initialize values from SETTINGS_REGISTRY defaults + stored theme
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const setting of SETTINGS_REGISTRY) {
      initial[setting.id] = setting.defaultValue;
    }
    if (typeof window !== "undefined") {
      initial["preferences.theme"] = getStoredTheme();
    }
    return initial;
  });

  // Apply theme when component mounts or theme changes
  useEffect(() => {
    const currentTheme = (values["preferences.theme"] as ThemeMode) || "system";
    applyTheme(currentTheme);
  }, [values]);

  const handleChange = useCallback((settingId: string, nextValue: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [settingId]: nextValue };
      if (settingId === "preferences.theme") {
        applyTheme(nextValue as ThemeMode);
      }
      return next;
    });
  }, []);

  const handleActionClick = useCallback(
    (settingId: string) => {
      if (onActionClick) {
        onActionClick(settingId);
      }
    },
    [onActionClick]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div className="relative flex flex-col md:flex-row w-full max-w-4xl h-[640px] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/50 p-4 flex flex-col justify-between">
          <div>
            <h2
              id="settings-dialog-title"
              className="text-sm font-semibold text-zinc-100 mb-4 px-2 tracking-tight"
            >
              Settings
            </h2>
            <nav className="space-y-1">
              {PAGES_CONFIG.map((p) => {
                const isActive = activePage === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePage(p.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-4 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        </aside>

        {/* Content Pane */}
        <main className="flex-1 overflow-y-auto p-6 bg-zinc-950">
          <SettingsRenderer
            page={activePage}
            values={values}
            onChange={handleChange}
            onActionClick={handleActionClick}
          />
        </main>
      </div>
    </div>
  );
};
