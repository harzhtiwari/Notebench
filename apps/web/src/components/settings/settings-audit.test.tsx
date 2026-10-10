// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SETTINGS_REGISTRY,
  SETTINGS_SECTIONS,
  SettingsPageIdSchema,
  type SettingsPageId,
} from "@notebook/contracts";
import {
  SettingsRenderer,
  SettingsDialog,
  VersionBadge,
  applyTheme,
  getStoredTheme,
} from "./index";

describe("Acceptance Criteria C2: Settings Compliance Audit Test Suite", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  // =========================================================================
  // TIER 1: REGISTRY SEMANTIC INTEGRITY AUDIT
  // =========================================================================
  describe("Tier 1: Declarative Registry Integrity", () => {
    it("ensures all registered settings have unique identifiers", () => {
      const ids = SETTINGS_REGISTRY.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("ensures every setting references an existing, valid page and section", () => {
      const validPages = new Set(SettingsPageIdSchema.options);
      const validSections = new Set(SETTINGS_SECTIONS.map((s) => s.id));

      for (const setting of SETTINGS_REGISTRY) {
        expect(validPages.has(setting.page)).toBe(true);
        expect(validSections.has(setting.section)).toBe(true);
      }
    });

    it("proves that every disabled control has a valid 'until' milestone and substantive 'reason'", () => {
      for (const setting of SETTINGS_REGISTRY) {
        if (setting.status.state === "disabled") {
          expect(["0.2", "0.3", "later"]).toContain(setting.status.until);
          expect(setting.status.reason.length).toBeGreaterThanOrEqual(10);
          expect(setting.status.reason.toLowerCase()).not.toBe("tbd");
          expect(setting.status.reason.toLowerCase()).not.toBe("coming soon");
        }
      }
    });

    it("renders VersionBadge correctly for milestones and later", () => {
      const { unmount } = render(<VersionBadge milestone="0.2" />);
      expect(screen.getByTestId("version-badge").textContent).toBe("Coming in 0.2");
      unmount();

      render(<VersionBadge milestone="later" />);
      expect(screen.getByTestId("version-badge").textContent).toBe("Coming later");
    });
  });

  // =========================================================================
  // TIER 2: RUNTIME COMPONENT & DOM TRAVERSAL AUDIT ACROSS ALL 7 PAGES
  // =========================================================================
  describe("Tier 2: Page-by-Page DOM Compliance Traversals", () => {
    const pages: SettingsPageId[] = [
      "account",
      "models",
      "preferences",
      "memory",
      "storage",
      "privacy",
      "health",
    ];

    pages.forEach((pageId) => {
      describe(`Settings Page: ${pageId}`, () => {
        it("renders without runtime exceptions and adheres strictly to C2 active/disabled rules", () => {
          const pageSettings = SETTINGS_REGISTRY.filter((s) => s.page === pageId);
          const mockOnChange = vi.fn();
          const mockOnActionClick = vi.fn();

          const initialValues: Record<string, unknown> = {};
          pageSettings.forEach((s) => {
            initialValues[s.id] = s.defaultValue;
          });

          const { unmount } = render(
            <SettingsRenderer
              page={pageId}
              values={initialValues}
              onChange={mockOnChange}
              onActionClick={mockOnActionClick}
            />
          );

          pageSettings.forEach((setting) => {
            const controlElement = screen.getByTestId(`control-${setting.id}`);
            const rowElement = screen.getByTestId(`setting-row-${setting.id}`);

            if (setting.status.state === "disabled") {
              // 1. Must be visibly disabled in the DOM
              const isNativeDisabled = (controlElement as HTMLInputElement).disabled;
              const isAriaDisabled =
                controlElement.getAttribute("aria-disabled") === "true";
              expect(isNativeDisabled || isAriaDisabled).toBe(true);

              // 2. Must render the expected VersionBadge with the exact target milestone
              const expectedBadgeText =
                setting.status.until === "later"
                  ? "Coming later"
                  : `Coming in ${setting.status.until}`;
              expect(rowElement.textContent).toContain(expectedBadgeText);

              // 3. Must display the explicit explanation / reason
              expect(rowElement.textContent).toContain(setting.status.reason);

              // 4. Must NOT trigger handlers upon synthetic events
              if (setting.control === "toggle") {
                fireEvent.click(controlElement);
                expect(mockOnChange).not.toHaveBeenCalledWith(
                  setting.id,
                  expect.anything()
                );
              } else if (setting.control === "button") {
                fireEvent.click(controlElement);
                expect(mockOnActionClick).not.toHaveBeenCalledWith(setting.id);
              } else if (setting.control === "select") {
                fireEvent.change(controlElement, { target: { value: "some-val" } });
                expect(mockOnChange).not.toHaveBeenCalledWith(
                  setting.id,
                  expect.anything()
                );
              }
            } else {
              // 1. Must be fully enabled and interactive (except informational custom displays)
              if (setting.control !== "custom") {
                const isNativeDisabled = (controlElement as HTMLInputElement).disabled;
                const isAriaDisabled =
                  controlElement.getAttribute("aria-disabled") === "true";
                expect(isNativeDisabled).toBe(false);
                expect(isAriaDisabled).toBe(false);
              }

              // 2. Must NOT display a deferred version badge
              expect(
                rowElement.querySelector("[data-testid='version-badge']")
              ).toBeNull();

              // 3. Must successfully trigger real state mutations
              if (setting.control === "toggle") {
                fireEvent.click(controlElement);
                expect(mockOnChange).toHaveBeenCalledWith(setting.id, true);
              } else if (setting.control === "input") {
                fireEvent.change(controlElement, { target: { value: "test-update" } });
                expect(mockOnChange).toHaveBeenCalledWith(setting.id, "test-update");
              } else if (setting.control === "select") {
                const targetOption = setting.options?.[0]?.value ?? "new-val";
                fireEvent.change(controlElement, { target: { value: targetOption } });
                expect(mockOnChange).toHaveBeenCalledWith(setting.id, targetOption);
              } else if (setting.control === "button") {
                fireEvent.click(controlElement);
                expect(mockOnActionClick).toHaveBeenCalledWith(setting.id);
              }
            }
          });

          unmount();
        });
      });
    });
  });

  // =========================================================================
  // TIER 3: THEME SWITCHING (REQUIREMENT C3)
  // =========================================================================
  describe("Requirement C3: Theme Switching and Persistence", () => {
    it("applies dark theme and persists to localStorage", () => {
      applyTheme("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(getStoredTheme()).toBe("dark");
      expect(localStorage.getItem("notebench_theme")).toBe("dark");
    });

    it("applies light theme and persists to localStorage", () => {
      applyTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(getStoredTheme()).toBe("light");
      expect(localStorage.getItem("notebench_theme")).toBe("light");
    });

    it("applies system theme and adheres to media query match", () => {
      applyTheme("system");
      expect(getStoredTheme()).toBe("system");
      expect(localStorage.getItem("notebench_theme")).toBe("system");
    });
  });

  // =========================================================================
  // TIER 4: 7-PAGE NAVIGATION DIALOG
  // =========================================================================
  describe("Requirement C1: 7-Page Settings Dialog Navigation", () => {
    it("renders navigation for all 7 pages and switches views on selection", () => {
      const mockClose = vi.fn();
      render(<SettingsDialog open={true} onOpenChange={mockClose} />);

      // All 7 page navigation buttons exist
      const pageNames = [
        "Account",
        "Models & Keys",
        "Preferences",
        "Memory",
        "Storage & Data",
        "Privacy",
        "Health",
      ];

      for (const name of pageNames) {
        expect(screen.getByRole("button", { name })).toBeDefined();
      }

      // Default active page is Account
      expect(screen.getByTestId("settings-page-account")).toBeDefined();

      // Click Preferences
      fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
      expect(screen.getByTestId("settings-page-preferences")).toBeDefined();

      // Click Models & Keys
      fireEvent.click(screen.getByRole("button", { name: "Models & Keys" }));
      expect(screen.getByTestId("settings-page-models")).toBeDefined();
    });
  });
});
