// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuditTable } from "./index.js";
import { EmptyList } from "../primitives/index.js";
import type { AuditTableRow } from "./index.js";

afterEach(() => {
  cleanup();
});

describe("Settings audit patterns (ticket 24)", () => {
  describe("AuditTable", () => {
    const sampleRows: AuditTableRow[] = [
      {
        id: "theme",
        control: "Interface Theme",
        reader: "settings.theme.get()",
        writer: "settings.theme.set()",
        status: "pass",
      },
      {
        id: "grounding",
        control: "Knowledge Retrieval Mode",
        reader: "settings.grounding.get()",
        writer: "settings.grounding.set()",
        status: "fail",
      },
      {
        id: "memory_rule",
        control: "Memory Rule Definition",
        reader: "memory.rules.get()",
        writer: "memory.rules.set()",
        status: "pass",
        milestone: "0.3",
      },
    ];

    it("renders the table headers for control, reader, writer, and pass-fail", () => {
      render(<AuditTable rows={sampleRows} />);

      expect(screen.getByRole("columnheader", { name: /control/i })).toBeDefined();
      expect(screen.getByRole("columnheader", { name: /reader/i })).toBeDefined();
      expect(screen.getByRole("columnheader", { name: /writer/i })).toBeDefined();
      expect(screen.getByRole("columnheader", { name: /pass \/ fail|status/i })).toBeDefined();
    });

    it("renders all rows with reader, writer, and control cells", () => {
      render(<AuditTable rows={sampleRows} />);

      expect(screen.getByText("Interface Theme")).toBeDefined();
      expect(screen.getByText("settings.theme.get()")).toBeDefined();
      expect(screen.getByText("settings.theme.set()")).toBeDefined();

      expect(screen.getByText("Knowledge Retrieval Mode")).toBeDefined();
      expect(screen.getByText("settings.grounding.get()")).toBeDefined();
      expect(screen.getByText("settings.grounding.set()")).toBeDefined();
    });

    it("renders pass and fail badges with icons and labels (never color-alone)", () => {
      render(<AuditTable rows={sampleRows} />);

      const passLabels = screen.getAllByText("Pass");
      expect(passLabels.length).toBeGreaterThanOrEqual(1);

      const failLabels = screen.getAllByText("Fail");
      expect(failLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("renders VersionBadge for controls with roadmap milestone", () => {
      render(<AuditTable rows={sampleRows} />);

      // VersionBadge for milestone 0.3 renders "Coming in 0.3"
      expect(screen.getByText("Coming in 0.3")).toBeDefined();
    });

    it("enforces glossary term for Memory Rule rows without synonyms", () => {
      render(<AuditTable rows={sampleRows} />);

      expect(screen.getByText("Memory Rule Definition")).toBeDefined();
      // Ensure banned synonyms are not present
      expect(screen.queryByText(/system prompt/i)).toBeNull();
      expect(screen.queryByText(/custom instruction/i)).toBeNull();
      expect(screen.queryByText(/persona/i)).toBeNull();
    });

    it("renders empty state or message when no rows are provided", () => {
      render(<AuditTable rows={[]} emptyMessage="No audit controls registered." />);

      expect(screen.getByText("No audit controls registered.")).toBeDefined();
    });
  });

  describe("EmptyList", () => {
    it("renders default empty state for Memory Rules with glossary term and 0.3 milestone", () => {
      render(<EmptyList />);

      // Must use glossary term "Memory Rule" / "Memory Rules", never synonyms
      expect(screen.getByRole("heading", { name: /Memory Rules/i })).toBeDefined();
      expect(screen.queryByText(/system prompt/i)).toBeNull();
      expect(screen.queryByText(/custom instruction/i)).toBeNull();
      expect(screen.queryByText(/persona/i)).toBeNull();

      // Copy specifies 0.3 arrival
      expect(screen.getByText(/Memory rules arrive in 0\.3/i)).toBeDefined();

      // Reuses VersionBadge landed component
      expect(screen.getByText("Coming in 0.3")).toBeDefined();
    });

    it("renders inactive list items when provided", () => {
      const inactiveRules = [
        "Always cite page numbers for legal sources",
        "Keep technical explanations concise",
      ];
      render(<EmptyList items={inactiveRules} />);

      expect(screen.getByText("Always cite page numbers for legal sources")).toBeDefined();
      expect(screen.getByText("Keep technical explanations concise")).toBeDefined();
      expect(screen.getByText(/Memory rules arrive in 0\.3/i)).toBeDefined();
    });

    it("supports custom title, description, and entityName for general audit items", () => {
      render(
        <EmptyList
          title="No Audit Findings"
          description="All registered controls passed reader/writer truth verification."
          entityName="audit items"
        />
      );

      expect(screen.getByText("No Audit Findings")).toBeDefined();
      expect(
        screen.getByText("All registered controls passed reader/writer truth verification.")
      ).toBeDefined();
    });

    it("triggers action callback when action button is provided and clicked", () => {
      const onAction = vi.fn();
      render(
        <EmptyList
          actionLabel="Refresh Audit"
          onAction={onAction}
        />
      );

      const button = screen.getByRole("button", { name: "Refresh Audit" });
      fireEvent.click(button);
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
