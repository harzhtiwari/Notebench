// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog, ReauthField } from "./index.js";
import {
  DELETION_LEVELS,
  getDeletionLevel,
  type DeletionLevelDefinition,
} from "../../lib/deletion-levels.js";

afterEach(() => {
  cleanup();
});

describe("deletion and re-auth patterns (ticket 20)", () => {
  describe("deletion levels table", () => {
    it("defines all 6 deletion levels with required metadata", () => {
      expect(DELETION_LEVELS).toHaveLength(6);

      const def: DeletionLevelDefinition = getDeletionLevel(1);
      expect(def.id).toBe("cache");

      const levelIds = DELETION_LEVELS.map((d) => d.id);
      expect(levelIds).toEqual([
        "cache",
        "memory",
        "notebook",
        "all_notebooks",
        "keys",
        "everything",
      ]);

      for (const def of DELETION_LEVELS) {
        expect(def.level).toBeGreaterThanOrEqual(1);
        expect(def.level).toBeLessThanOrEqual(6);
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(["low", "medium", "high"]).toContain(def.risk);
        expect(Array.isArray(def.owners)).toBe(true);
        expect(def.owners.length).toBeGreaterThan(0);
        expect(Array.isArray(def.effects)).toBe(true);
        expect(def.effects.length).toBeGreaterThan(0);
      }
    });

    it("identifies high-risk levels requiring re-auth", () => {
      const level1 = getDeletionLevel(1);
      expect(level1.risk).toBe("low");
      expect(level1.reauth).toBe(false);

      const level5 = getDeletionLevel(5);
      expect(level5.risk).toBe("high");
      expect(level5.reauth).toBe(true);

      const level6 = getDeletionLevel("everything");
      expect(level6.risk).toBe("high");
      expect(level6.reauth).toBe(true);
      expect(level6.disclosures?.length).toBeGreaterThan(0);
    });

    it("looks up levels by number or level id", () => {
      expect(getDeletionLevel(3).id).toBe("notebook");
      expect(getDeletionLevel("notebook").level).toBe(3);
    });
  });

  describe("ReauthField component", () => {
    it("renders passcode input in passcode mode", () => {
      let value = "";
      render(
        <ReauthField
          mode="passcode"
          value={value}
          onChange={(v) => {
            value = v;
          }}
          label="Enter owner passcode"
        />
      );

      const input = screen.getByLabelText("Enter owner passcode");
      expect(input.getAttribute("type")).toBe("password");

      fireEvent.change(input, { target: { value: "secret123" } });
      expect(value).toBe("secret123");
    });

    it("renders phrase input in phrase mode with expected phrase hint", () => {
      let value = "";
      render(
        <ReauthField
          mode="phrase"
          expectedPhrase="DELETE"
          value={value}
          onChange={(v) => {
            value = v;
          }}
        />
      );

      const input = screen.getByRole("textbox");
      expect(screen.getByText(/type "DELETE" to confirm/i)).toBeDefined();

      fireEvent.change(input, { target: { value: "DELETE" } });
      expect(value).toBe("DELETE");
    });

    it("displays error message when provided", () => {
      render(
        <ReauthField
          mode="passcode"
          value=""
          onChange={() => {}}
          error="Incorrect passcode entered"
        />
      );

      expect(screen.getByText("Incorrect passcode entered")).toBeDefined();
    });
  });

  describe("ConfirmDialog component", () => {
    it("renders 1-click confirmation for Level 1 (Clear Cache) with effect list", () => {
      let confirmed = false;
      render(
        <ConfirmDialog
          open
          level={1}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText("Clear Cache")).toBeDefined();
      expect(screen.getByText(/Purge temporary cache/i)).toBeDefined();

      // Effect list should be visible
      expect(screen.getByText(/Purges \.tmp\/cache\/\*/i)).toBeDefined();

      // For Level 1, confirm button is immediately active (no reauth)
      const confirmBtn = screen.getByRole("button", { name: /confirm|delete|clear/i });
      expect(confirmBtn.hasAttribute("disabled")).toBe(false);

      fireEvent.click(confirmBtn);
      expect(confirmed).toBe(true);
    });

    it("requires typing the notebook title for Level 3 when no passcode is configured", () => {
      let confirmed = false;
      let typed = "";
      const { rerender } = render(
        <ConfirmDialog
          open
          level={3}
          targetName="Biology 101"
          hasPasscode={false}
          reauthText={typed}
          onReauthTextChange={(v) => {
            typed = v;
          }}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );

      expect(screen.getByText("Delete Notebook")).toBeDefined();
      expect(screen.getByText(/Permanently delete this notebook/i)).toBeDefined();

      const confirmBtn = screen.getByRole("button", { name: /delete|confirm/i });
      // Initially disabled because title is not typed
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);

      // Typing wrong title keeps it disabled
      rerender(
        <ConfirmDialog
          open
          level={3}
          targetName="Biology 101"
          hasPasscode={false}
          reauthText="Wrong Title"
          onReauthTextChange={(v) => {
            typed = v;
          }}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);

      // Typing correct title enables confirmation
      rerender(
        <ConfirmDialog
          open
          level={3}
          targetName="Biology 101"
          hasPasscode={false}
          reauthText="Biology 101"
          onReauthTextChange={(v) => {
            typed = v;
          }}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );
      expect(confirmBtn.hasAttribute("disabled")).toBe(false);

      fireEvent.click(confirmBtn);
      expect(confirmed).toBe(true);
    });

    it("requires passcode re-authentication for Level 5 when passcode is configured", () => {
      let confirmed = false;
      let typedPasscode = "";
      const { rerender } = render(
        <ConfirmDialog
          open
          level={5}
          hasPasscode={true}
          reauthText={typedPasscode}
          onReauthTextChange={(v) => {
            typedPasscode = v;
          }}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );

      expect(screen.getByText("Delete API Keys")).toBeDefined();
      const confirmBtn = screen.getByRole("button", { name: /delete|confirm/i });
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);

      // Passcode entered enables delete button
      rerender(
        <ConfirmDialog
          open
          level={5}
          hasPasscode={true}
          reauthText="my-secret-passcode"
          onReauthTextChange={(v) => {
            typedPasscode = v;
          }}
          onConfirm={() => {
            confirmed = true;
          }}
        />
      );
      expect(confirmBtn.hasAttribute("disabled")).toBe(false);

      fireEvent.click(confirmBtn);
      expect(confirmed).toBe(true);
    });

    it("renders honest limits disclosure on Level 6 (Factory Reset)", () => {
      render(
        <ConfirmDialog
          open
          level={6}
          onConfirm={() => {}}
        />
      );

      expect(screen.getByText("Factory Reset")).toBeDefined();
      expect(screen.getByText(/Honest limits disclosure/i)).toBeDefined();
      expect(screen.getByText(/Local Backups/i)).toBeDefined();
      expect(screen.getByText(/Cloud LLM Providers/i)).toBeDefined();
    });

    it("enforces export backup acknowledgment before deletion when configured", () => {
      let exportCalled = false;
      render(
        <ConfirmDialog
          open
          level={2}
          requireBackupAcknowledgment={true}
          onExportBackup={() => {
            exportCalled = true;
          }}
          onConfirm={() => {}}
        />
      );

      const exportBtn = screen.getByRole("button", { name: /export backup/i });
      expect(exportBtn).toBeDefined();

      const confirmBtn = screen.getByRole("button", { name: /delete|clear|confirm/i });
      // Disabled because neither exported nor checkbox acknowledged
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);

      fireEvent.click(exportBtn);
      expect(exportCalled).toBe(true);

      // Check the acknowledgment checkbox
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      // Now enabled
      expect(confirmBtn.hasAttribute("disabled")).toBe(false);
    });

    it("handles cancel action", () => {
      let cancelled = false;
      render(
        <ConfirmDialog
          open
          level={1}
          onCancel={() => {
            cancelled = true;
          }}
          onConfirm={() => {}}
        />
      );

      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelBtn);
      expect(cancelled).toBe(true);
    });
  });
});
