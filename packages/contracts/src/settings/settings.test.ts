import { describe, it, expect } from "vitest";
import {
  SettingsPageIdSchema,
  SettingControlKindSchema,
  TargetMilestoneSchema,
  SettingStatusSchema,
  SETTINGS_SECTIONS,
  SETTINGS_REGISTRY,
  getSettingsForPage,
  getSectionsForPage,
} from "./index.js";

describe("Declarative Settings Registry Contract (@notebook/contracts)", () => {
  describe("Zod Enums and Schemas", () => {
    it("validates all 7 required settings pages in SettingsPageIdSchema", () => {
      const requiredPages = [
        "account",
        "models",
        "preferences",
        "memory",
        "storage",
        "privacy",
        "health",
      ];

      for (const page of requiredPages) {
        expect(SettingsPageIdSchema.safeParse(page).success).toBe(true);
      }
      expect(SettingsPageIdSchema.safeParse("unknown_page").success).toBe(false);
    });

    it("validates setting control kinds", () => {
      const validKinds = ["toggle", "select", "input", "button", "custom"];
      for (const kind of validKinds) {
        expect(SettingControlKindSchema.safeParse(kind).success).toBe(true);
      }
      expect(SettingControlKindSchema.safeParse("checkbox").success).toBe(false);
    });

    it("validates target milestone versions", () => {
      expect(TargetMilestoneSchema.safeParse("0.2").success).toBe(true);
      expect(TargetMilestoneSchema.safeParse("0.3").success).toBe(true);
      expect(TargetMilestoneSchema.safeParse("later").success).toBe(true);
      expect(TargetMilestoneSchema.safeParse("0.1").success).toBe(false);
      expect(TargetMilestoneSchema.safeParse("1.0").success).toBe(false);
    });

    it("enforces discriminated union on SettingStatusSchema", () => {
      // Enabled
      expect(SettingStatusSchema.safeParse({ state: "enabled" }).success).toBe(true);

      // Disabled with valid until and reason
      const validDisabled = {
        state: "disabled",
        until: "0.2",
        reason: "Per-task model routing arrives in 0.2",
      };
      expect(SettingStatusSchema.safeParse(validDisabled).success).toBe(true);

      // Disabled missing until
      expect(
        SettingStatusSchema.safeParse({
          state: "disabled",
          reason: "Some valid reason text here",
        }).success
      ).toBe(false);

      // Disabled with short reason (< 10 chars)
      expect(
        SettingStatusSchema.safeParse({
          state: "disabled",
          until: "0.3",
          reason: "Too short",
        }).success
      ).toBe(false);
    });
  });

  describe("SETTINGS_SECTIONS Catalog", () => {
    it("contains sections covering all 7 pages", () => {
      const pagesWithSections = new Set(SETTINGS_SECTIONS.map((s) => s.page));
      for (const page of SettingsPageIdSchema.options) {
        expect(pagesWithSections.has(page)).toBe(true);
      }
    });

    it("has unique section IDs", () => {
      const sectionIds = SETTINGS_SECTIONS.map((s) => s.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
    });
  });

  describe("SETTINGS_REGISTRY Integrity (Requirement C2)", () => {
    it("ensures all registered settings have unique IDs", () => {
      const ids = SETTINGS_REGISTRY.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("ensures every setting references an existing page and valid section", () => {
      const validPages = new Set(SettingsPageIdSchema.options);
      const validSections = new Set(SETTINGS_SECTIONS.map((s) => s.id));

      for (const setting of SETTINGS_REGISTRY) {
        expect(validPages.has(setting.page)).toBe(true);
        expect(validSections.has(setting.section)).toBe(true);
      }
    });

    it("ensures default values conform to the declared valueSchema", () => {
      for (const setting of SETTINGS_REGISTRY) {
        const parseResult = setting.valueSchema.safeParse(setting.defaultValue);
        expect(
          parseResult.success,
          `Setting ${setting.id} defaultValue failed valueSchema: ${parseResult.error?.message}`
        ).toBe(true);
      }
    });

    it("enforces Requirement C2: every disabled setting has a roadmap milestone and explanation >= 10 chars", () => {
      for (const setting of SETTINGS_REGISTRY) {
        if (setting.status.state === "disabled") {
          expect(["0.2", "0.3", "later"]).toContain(setting.status.until);
          expect(setting.status.reason.length).toBeGreaterThanOrEqual(10);
          expect(setting.status.reason.toLowerCase()).not.toBe("tbd");
          expect(setting.status.reason.toLowerCase()).not.toBe("coming soon");
        }
      }
    });

    it("contains mandatory Milestone 0.1 settings across all 7 pages", () => {
      const ids = new Set(SETTINGS_REGISTRY.map((s) => s.id));

      // Account
      expect(ids.has("account.name")).toBe(true);
      expect(ids.has("account.passcode")).toBe(true);
      expect(ids.has("account.logout")).toBe(true);
      expect(ids.has("account.delete")).toBe(true);
      expect(ids.has("account.multiUser")).toBe(true);

      // Models
      expect(ids.has("models.openaiKey")).toBe(true);
      expect(ids.has("models.anthropicKey")).toBe(true);
      expect(ids.has("models.googleKey")).toBe(true);
      expect(ids.has("models.ollamaUrl")).toBe(true);
      expect(ids.has("models.chatModel")).toBe(true);
      expect(ids.has("models.embeddingModel")).toBe(true);
      expect(ids.has("models.perTask")).toBe(true);

      // Preferences
      expect(ids.has("preferences.theme")).toBe(true);
      expect(ids.has("preferences.groundingMode")).toBe(true);
      expect(ids.has("preferences.defaultExport")).toBe(true);
      expect(ids.has("preferences.language")).toBe(true);

      // Memory
      expect(ids.has("memory.enabled")).toBe(true);
      expect(ids.has("memory.rulesEditor")).toBe(true);
      expect(ids.has("memory.viewLearned")).toBe(true);

      // Storage
      expect(ids.has("storage.usageBreakdown")).toBe(true);
      expect(ids.has("storage.clearCache")).toBe(true);
      expect(ids.has("storage.clearMemory")).toBe(true);
      expect(ids.has("storage.exportAll")).toBe(true);
      expect(ids.has("storage.deleteEverything")).toBe(true);
      expect(ids.has("storage.s3Adapter")).toBe(true);

      // Privacy
      expect(ids.has("privacy.zeroTelemetry")).toBe(true);
      expect(ids.has("privacy.dntStatus")).toBe(true);
      expect(ids.has("privacy.crashReports")).toBe(true);

      // Health
      expect(ids.has("health.doctorReport")).toBe(true);
      expect(ids.has("health.autoRepair")).toBe(true);
    });

    it("marks destructive actions with isDestructive and requiresPasscode flags", () => {
      const accountDelete = SETTINGS_REGISTRY.find((s) => s.id === "account.delete");
      expect(accountDelete?.isDestructive).toBe(true);
      expect(accountDelete?.requiresPasscode).toBe(true);

      const storageDeleteAll = SETTINGS_REGISTRY.find((s) => s.id === "storage.deleteEverything");
      expect(storageDeleteAll?.isDestructive).toBe(true);
      expect(storageDeleteAll?.requiresPasscode).toBe(true);
    });
  });

  describe("Query Helpers", () => {
    it("getSettingsForPage filters settings correctly", () => {
      for (const page of SettingsPageIdSchema.options) {
        const pageSettings = getSettingsForPage(page);
        expect(pageSettings.length).toBeGreaterThan(0);
        for (const s of pageSettings) {
          expect(s.page).toBe(page);
        }
      }
    });

    it("getSectionsForPage filters and orders sections correctly", () => {
      for (const page of SettingsPageIdSchema.options) {
        const pageSections = getSectionsForPage(page);
        expect(pageSections.length).toBeGreaterThan(0);
        for (let i = 1; i < pageSections.length; i++) {
          expect(pageSections[i]!.order).toBeGreaterThanOrEqual(pageSections[i - 1]!.order);
        }
      }
    });
  });
});
