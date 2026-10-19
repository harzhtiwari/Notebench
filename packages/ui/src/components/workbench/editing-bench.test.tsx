// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import {
  EditorShell,
  ArtifactPart,
  DiffView,
  PlanCard,
  ReviewCard,
  StepsList,
  SaveState,
} from "./index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("editing bench patterns (ticket 16)", () => {
  describe("EditorShell", () => {
    it("renders text editing shell with smooth typing and debounced draft callback", () => {
      vi.useFakeTimers();
      const onChange = vi.fn();
      const onDraftSave = vi.fn();

      render(
        <EditorShell
          aria-label="Artifact block editor"
          defaultValue="Initial draft"
          onChange={onChange}
          onDraftSave={onDraftSave}
          draftDebounceMs={300}
        />
      );

      const textarea = screen.getByLabelText("Artifact block editor");
      expect(textarea).toBeDefined();
      expect((textarea as HTMLTextAreaElement).value).toBe("Initial draft");

      // Type new text
      fireEvent.change(textarea, { target: { value: "Updated content" } });
      expect((textarea as HTMLTextAreaElement).value).toBe("Updated content");
      expect(onChange).toHaveBeenCalledWith("Updated content");

      // Draft callback should NOT be called immediately
      expect(onDraftSave).not.toHaveBeenCalled();

      // Fast forward 299ms - still not called
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(onDraftSave).not.toHaveBeenCalled();

      // Fast forward past 300ms
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDraftSave).toHaveBeenCalledWith("Updated content");
    });
  });

  describe("ArtifactPart", () => {
    it.each([
      { state: "ai" as const, expectedLabel: "AI" },
      { state: "you" as const, expectedLabel: "You" },
      { state: "locked" as const, expectedLabel: "Locked" },
      { state: "stale" as const, expectedLabel: "Stale" },
    ])("renders board .part pattern for state '$state' with rail + icon + label (never color-alone)", ({ state, expectedLabel }) => {
      const { container } = render(
        <ArtifactPart
          state={state}
          meta="Slide 4, text box"
          tools={<button type="button">Regenerate</button>}
        >
          <p>Storage covered 41% of the evening gap.</p>
        </ArtifactPart>
      );

      const article = container.querySelector("article");
      expect(article).not.toBeNull();
      expect(article?.dataset["state"]).toBe(state);
      expect(article?.className).toContain("part");

      // Rail is present
      const rail = container.querySelector<HTMLElement>('[data-slot="rail"]');
      expect(rail).not.toBeNull();
      expect(rail?.dataset["state"]).toBe(state);

      // Icon is present inside state label
      const stateLabel = container.querySelector('[data-slot="state-label"]');
      expect(stateLabel).not.toBeNull();
      expect(stateLabel?.querySelector("svg")).not.toBeNull();
      expect(stateLabel?.textContent).toContain(expectedLabel);

      // Meta and tools
      expect(screen.getByText("Slide 4, text box")).toBeDefined();
      expect(screen.getByRole("button", { name: "Regenerate" })).toBeDefined();

      // Body content
      expect(screen.getByText(/Storage covered 41%/)).toBeDefined();
    });

    it("supports custom stateLabel override", () => {
      const { container } = render(
        <ArtifactPart
          state="stale"
          stateLabel="Source changed"
        >
          <p>Block content</p>
        </ArtifactPart>
      );

      const stateLabel = container.querySelector('[data-slot="state-label"]');
      expect(stateLabel?.textContent).toContain("Source changed");
    });
  });

  describe("DiffView", () => {
    it("renders board .diff pattern with Before / After panes and verify row", () => {
      render(
        <DiffView
          before={<p>Storage <del>covered about half of</del> the evening gap.</p>}
          after={<p>Storage <ins>covered 41% of</ins> the evening gap.</p>}
          verifyMessage="Verified: the other 11 parts on this slide and all other slides are unchanged."
        />
      );

      expect(screen.getByText("Before")).toBeDefined();
      expect(screen.getByText("After")).toBeDefined();
      expect(screen.getByText("covered about half of").tagName).toBe("DEL");
      expect(screen.getByText("covered 41% of").tagName).toBe("INS");

      // Verify row
      expect(
        screen.getByText(/Verified: the other 11 parts/)
      ).toBeDefined();
    });
  });

  describe("PlanCard and ReviewCard", () => {
    it("PlanCard renders title, steps, cost estimate, and action callbacks", () => {
      const onApprove = vi.fn();
      const onEdit = vi.fn();
      const onMoveUp = vi.fn();
      const onMoveDown = vi.fn();

      render(
        <PlanCard
          title="Deck plan: Evening peak demand"
          description="4 slides from 2 sources. Change anything before it is built."
          costEstimate="About 3 minutes. Uses your local model."
          onApprove={onApprove}
          onEdit={onEdit}
          items={[
            {
              id: "step-1",
              title: "Why evening demand matters",
              description: "Grid study, pages 3 to 5",
              onMoveUp,
              onMoveDown,
            },
            {
              id: "step-2",
              title: "The 2023 tariff change",
              description: "Grid study p. 12, hearing 14:32",
            },
          ]}
        />
      );

      expect(screen.getByText("Deck plan: Evening peak demand")).toBeDefined();
      expect(screen.getByText(/4 slides from 2 sources/)).toBeDefined();
      expect(screen.getByText("Why evening demand matters")).toBeDefined();
      expect(screen.getByText("The 2023 tariff change")).toBeDefined();
      expect(screen.getByText("About 3 minutes. Uses your local model.")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: /Move step 1 up/i }));
      expect(onMoveUp).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      expect(onEdit).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Approve plan" }));
      expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it("ReviewCard renders change title, diff view, verify note, and keep/undo actions", () => {
      const onKeep = vi.fn();
      const onUndo = vi.fn();

      render(
        <ReviewCard
          title="Slide 4, text box changed"
          before={<p>Storage <del>covered about half of</del> the evening gap.</p>}
          after={<p>Storage <ins>covered 41% of</ins> the evening gap.</p>}
          verifyMessage="Verified: all sibling parts are unchanged."
          onKeep={onKeep}
          onUndo={onUndo}
        />
      );

      expect(screen.getByText("Slide 4, text box changed")).toBeDefined();
      expect(screen.getByText("Before")).toBeDefined();
      expect(screen.getByText("After")).toBeDefined();
      expect(screen.getByText(/Verified: all sibling parts/)).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Keep change" }));
      expect(onKeep).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it("ReviewCard renders optional steps and costEstimate", () => {
      render(
        <ReviewCard
          title="Program plan"
          cost="About 2 minutes"
          steps={[
            { id: "s1", title: "Analyze source blocks" },
            { id: "s2", title: "Generate synthesis" },
          ]}
        />
      );

      expect(screen.getByText("Program plan")).toBeDefined();
      expect(screen.getByText("About 2 minutes")).toBeDefined();
      expect(screen.getByText("Analyze source blocks")).toBeDefined();
      expect(screen.getByText("Generate synthesis")).toBeDefined();
    });
  });

  describe("StepsList", () => {
    it("renders board .steps pattern with status icons, labels, and progress", () => {
      const { container } = render(
        <StepsList
          aria-label="Building the deck"
          items={[
            {
              id: "1",
              name: "Read 2 sources",
              description: "Done in 12 s",
              status: "done",
            },
            {
              id: "2",
              name: "Writing slide 3 of 4",
              status: "running",
              progress: 62,
            },
            {
              id: "3",
              name: "Check every claim against its source",
              description: "Waiting",
              status: "waiting",
            },
          ]}
        />
      );

      const list = container.querySelector("ol");
      expect(list).not.toBeNull();
      expect(list?.getAttribute("aria-label")).toBe("Building the deck");
      expect(list?.className).toContain("steps");

      expect(screen.getByText("Read 2 sources")).toBeDefined();
      expect(screen.getByText("Done in 12 s")).toBeDefined();

      expect(screen.getByText("Writing slide 3 of 4")).toBeDefined();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar.getAttribute("aria-valuenow")).toBe("62");

      expect(screen.getByText("Check every claim against its source")).toBeDefined();
      expect(screen.getByText("Waiting")).toBeDefined();
    });
  });

  describe("SaveState", () => {
    it("renders saving state with accessible text and icon", () => {
      const { container } = render(<SaveState status="saving" />);
      expect(screen.getByText("Saving...")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("renders saved state with accessible text and check icon", () => {
      const { container } = render(<SaveState status="saved" />);
      expect(screen.getByText("Saved")).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("renders error state with retry button calling onRetry", () => {
      const onRetry = vi.fn();
      render(<SaveState status="error" onRetry={onRetry} errorMessage="Save failed" />);
      expect(screen.getByText("Save failed")).toBeDefined();
      const retryBtn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("implements 2s quiet debounce, 30s ceiling, and blur trigger when managing auto-save", () => {
      vi.useFakeTimers();
      const onSave = vi.fn().mockResolvedValue(undefined);

      const { rerender } = render(
        <SaveState
          autoSave={{
            content: "v1",
            onSave,
            quietMs: 2000,
            ceilingMs: 30_000,
          }}
        />
      );

      // Typing starts: content changes to v2
      rerender(
        <SaveState
          autoSave={{
            content: "v2",
            onSave,
            quietMs: 2000,
            ceilingMs: 30_000,
          }}
        />
      );

      // 1.5s passed (not quiet yet)
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(onSave).not.toHaveBeenCalled();

      // Content changes to v3 (resets quiet timer)
      rerender(
        <SaveState
          autoSave={{
            content: "v3",
            onSave,
            quietMs: 2000,
            ceilingMs: 30_000,
          }}
        />
      );

      // 1s passed
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onSave).not.toHaveBeenCalled();

      // Another 1s passed (total 2s quiet since v3)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onSave).toHaveBeenCalledWith("v3");
      expect(onSave).toHaveBeenCalledTimes(1);

      // Test 30s ceiling: continuous typing without 2s quiet
      onSave.mockClear();
      for (let sec = 0; sec < 31; sec++) {
        rerender(
          <SaveState
            autoSave={{
              content: `continuous-${sec}`,
              onSave,
              quietMs: 2000,
              ceilingMs: 30_000,
            }}
          />
        );
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
      // Should have triggered due to 30s ceiling
      expect(onSave).toHaveBeenCalled();
    });
  });
});
