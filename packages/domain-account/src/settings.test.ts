import { describe, it, expect } from "vitest";
import {
  validateSettingUpdate,
  resolveEffectiveSettings,
  getSettingDefinition,
} from "./index.js";
import {
  NotFoundError,
  ValidationError,
  SETTINGS_REGISTRY,
} from "@notebook/contracts";

describe("Domain Account: Settings Service (@notebook/domain-account)", () => {
  describe("validateSettingUpdate", () => {
    it("throws NotFoundError when setting ID does not exist in registry", () => {
      expect(() => {
        validateSettingUpdate("invalid.setting.key", "value");
      }).toThrowError(NotFoundError);
    });

    it("throws ValidationError when attempting to modify a disabled setting", () => {
      // account.multiUser is disabled until 0.3
      expect(() => {
        validateSettingUpdate("account.multiUser", true);
      }).toThrowError(ValidationError);

      try {
        validateSettingUpdate("account.multiUser", true);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ValidationError);
        const validationErr = err as ValidationError;
        expect(validationErr.message).toContain("disabled until version 0.3");
      }
    });

    it("throws ValidationError when value does not conform to valueSchema", () => {
      // preferences.theme must be "light" | "dark" | "system"
      expect(() => {
        validateSettingUpdate("preferences.theme", "neon-rainbow");
      }).toThrowError(ValidationError);
    });

    it("returns parsed and validated value for valid update", () => {
      const validResult = validateSettingUpdate("preferences.theme", "dark");
      expect(validResult).toBe("dark");

      const nameResult = validateSettingUpdate("account.name", "Alice");
      expect(nameResult).toBe("Alice");
    });
  });

  describe("resolveEffectiveSettings", () => {
    it("populates registry defaults for all registered settings when empty", () => {
      const resolved = resolveEffectiveSettings({});

      for (const setting of SETTINGS_REGISTRY) {
        expect(resolved[setting.id]).toEqual(setting.defaultValue);
      }
    });

    it("overrides defaults with valid stored values", () => {
      const stored = {
        "preferences.theme": "dark",
        "account.name": "Custom User",
      };

      const resolved = resolveEffectiveSettings(stored);
      expect(resolved["preferences.theme"]).toBe("dark");
      expect(resolved["account.name"]).toBe("Custom User");
      // Other defaults remain intact
      expect(resolved["models.chatModel"]).toBe("gpt-4o");
    });
  });

  describe("getSettingDefinition", () => {
    it("retrieves the setting definition by ID", () => {
      const def = getSettingDefinition("preferences.theme");
      expect(def).toBeDefined();
      expect(def?.id).toBe("preferences.theme");
      expect(def?.page).toBe("preferences");
    });

    it("returns undefined for unknown ID", () => {
      const def = getSettingDefinition("non.existent");
      expect(def).toBeUndefined();
    });
  });
});
