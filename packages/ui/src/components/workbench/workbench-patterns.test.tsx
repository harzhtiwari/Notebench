// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import * as React from "react";

import { Flashcard, QuizQuestion, AutosaveDot, DraftRecoveryBanner } from "./index.js";
import { autosavePolicy } from "../../lib/autosave-policy.js";
import { useAutosave } from "../../hooks/use-autosave.js";
import type { FlashcardItem, QuizQuestion as QuizQuestionType } from "@notebench/contracts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("workbench flashcard and quiz patterns (ticket 15)", () => {
  const sampleCard: FlashcardItem = {
    id: "a1111111-1111-4111-8111-111111111111",
    front: "What is an invariant in Notebench?",
    back: "A bit-for-bit sibling AST preservation rule enforced by RFC 8785 JCS digests.",
    citations: [],
  };

  const sampleQuestion: QuizQuestionType = {
    id: "b2222222-2222-4222-8222-222222222222",
    prompt: "Which transport protocol is strictly banned in Notebench?",
    options: [
      { id: "c3333333-3333-4333-8333-333333333331", text: "Server-Sent Events (SSE)" },
      { id: "c3333333-3333-4333-8333-333333333332", text: "WebSockets" },
      { id: "c3333333-3333-4333-8333-333333333333", text: "HTTP REST" },
    ],
    correctOptionId: "c3333333-3333-4333-8333-333333333332",
    explanation: "WebSockets are banned in ADR 0001; Notebench uses HTTP REST and SSE.",
    citations: [],
  };

  describe("autosavePolicy definition and useAutosave hook", () => {
    it("exports canonical timings (300ms draft, 2000ms quiet, 30000ms ceiling)", () => {
      expect(autosavePolicy).toBeDefined();
      expect(autosavePolicy.draftDebounceMs).toBe(300);
      expect(autosavePolicy.commitQuietMs).toBe(2000);
      expect(autosavePolicy.commitCeilingMs).toBe(30000);
    });

    it("300ms draft write fires on edit; no commit during typing", async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn();
      const onCommit = vi.fn().mockResolvedValue(undefined);

      function TestEditor() {
        const [text, setText] = React.useState("initial");
        const { status } = useAutosave({
          value: text,
          onSaveDraft,
          onCommit,
        });
        return (
          <div>
            <input
              aria-label="editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span data-testid="status">{status}</span>
          </div>
        );
      }

      render(<TestEditor />);
      const input = screen.getByLabelText("editor");

      // Type a change
      fireEvent.change(input, { target: { value: "edited text" } });

      // Before 300ms: no draft saved, no commit
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onSaveDraft).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();

      // At 300ms: draft write fires
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft).toHaveBeenCalledWith("edited text");
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("quiet 2,000ms triggers one commit to server", async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn();
      const onCommit = vi.fn().mockResolvedValue(undefined);

      function TestEditor() {
        const [text, setText] = React.useState("initial");
        const { status } = useAutosave({
          value: text,
          onSaveDraft,
          onCommit,
        });
        return (
          <div>
            <input
              aria-label="editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span data-testid="status">{status}</span>
          </div>
        );
      }

      render(<TestEditor />);
      const input = screen.getByLabelText("editor");

      fireEvent.change(input, { target: { value: "edited once" } });

      // After 300ms draft saved
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onCommit).not.toHaveBeenCalled();

      // Quiet window reaches 2000ms
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith("edited once");
    });

    it("continuous typing for 30,000ms triggers a commit even without pause", async () => {
      vi.useFakeTimers();
      const onSaveDraft = vi.fn();
      const onCommit = vi.fn().mockResolvedValue(undefined);

      function TestEditor() {
        const [text, setText] = React.useState("initial");
        useAutosave({
          value: text,
          onSaveDraft,
          onCommit,
        });
        return (
          <input
            aria-label="editor"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        );
      }

      render(<TestEditor />);
      const input = screen.getByLabelText("editor");

      // Simulate typing every 1,000ms (less than 2,000ms quiet window) for 30 seconds
      for (let i = 1; i <= 30; i++) {
        fireEvent.change(input, { target: { value: `typing step ${i}` } });
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }

      // Hard ceiling at 30,000ms must force commit
      expect(onCommit).toHaveBeenCalled();
      expect(onCommit).toHaveBeenCalledWith("typing step 30");
    });

    it("manual commit or blur triggers immediate commit", async () => {
      vi.useFakeTimers();
      const onCommit = vi.fn().mockResolvedValue(undefined);

      function TestEditor() {
        const [text, setText] = React.useState("initial");
        const { commit } = useAutosave({
          value: text,
          onCommit,
        });
        return (
          <input
            aria-label="editor"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              void commit();
            }}
          />
        );
      }

      render(<TestEditor />);
      const input = screen.getByLabelText("editor");

      fireEvent.change(input, { target: { value: "blur commit text" } });
      expect(onCommit).not.toHaveBeenCalled();

      // Trigger blur
      await act(async () => {
        fireEvent.blur(input);
      });
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith("blur commit text");
    });

    it("failed commit keeps draft state and exposes retry", async () => {
      vi.useFakeTimers();
      const onCommit = vi.fn().mockRejectedValue(new Error("Network failed"));

      function TestEditor() {
        const [text, setText] = React.useState("initial");
        const { status, retry, error } = useAutosave({
          value: text,
          onCommit,
        });
        return (
          <div>
            <input
              aria-label="editor"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span data-testid="status">{status}</span>
            {error && <span data-testid="error">{error.message}</span>}
            {status === "error" && (
              <button onClick={() => void retry()}>Retry save</button>
            )}
          </div>
        );
      }

      render(<TestEditor />);
      const input = screen.getByLabelText("editor");

      fireEvent.change(input, { target: { value: "will fail" } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
        await Promise.resolve();
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("status").textContent).toBe("error");
      expect(screen.getByTestId("error").textContent).toBe("Network failed");

      // Now retry with success
      onCommit.mockResolvedValueOnce(undefined);
      const retryBtn = screen.getByRole("button", { name: "Retry save" });
      await act(async () => {
        fireEvent.click(retryBtn);
      });
      expect(onCommit).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("status").textContent).toBe("saved");
    });
  });

  describe("AutosaveDot component", () => {
    it("renders idle and saved states with accessible labels and icons (never color-alone)", () => {
      const { rerender } = render(<AutosaveDot status="saved" />);
      const statusEl = screen.getByRole("status");
      expect(statusEl.textContent).toContain("Saved");
      expect(statusEl.querySelector("svg")).not.toBeNull();

      rerender(<AutosaveDot status="drafting" />);
      expect(screen.getByRole("status").textContent).toContain("Editing...");

      rerender(<AutosaveDot status="saving" />);
      expect(screen.getByRole("status").textContent).toContain("Saving...");
    });

    it("renders error state with retry button and calls onRetry when clicked", () => {
      const onRetry = vi.fn();
      render(<AutosaveDot status="error" onRetry={onRetry} />);
      const statusEl = screen.getByRole("status");
      expect(statusEl.textContent).toContain("Save failed");
      const retryBtn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("DraftRecoveryBanner component", () => {
    it("renders reload / recovery offer for unsaved draft", () => {
      const onRecover = vi.fn();
      const onDiscard = vi.fn();
      render(
        <DraftRecoveryBanner
          draftTimestamp="10:45 AM"
          onRecover={onRecover}
          onDiscard={onDiscard}
        />
      );
      const banner = screen.getByRole("alert");
      expect(banner.textContent).toContain("Unsaved draft found");
      expect(banner.textContent).toContain("10:45 AM");

      const recoverBtn = screen.getByRole("button", { name: "Restore draft" });
      fireEvent.click(recoverBtn);
      expect(onRecover).toHaveBeenCalledTimes(1);

      const discardBtn = screen.getByRole("button", { name: "Discard" });
      fireEvent.click(discardBtn);
      expect(onDiscard).toHaveBeenCalledTimes(1);
    });
  });

  describe("Flashcard component", () => {
    it("renders front by default, flips to back on flip action or Space/Enter key", () => {
      const onFlip = vi.fn();
      render(<Flashcard card={sampleCard} flipped={false} onFlip={onFlip} />);

      expect(screen.getByText("What is an invariant in Notebench?")).toBeDefined();
      expect(
        screen.queryByText("A bit-for-bit sibling AST preservation rule enforced by RFC 8785 JCS digests.")
      ).toBeNull();

      const flipBtn = screen.getByRole("button", { name: "Flip card" });
      fireEvent.click(flipBtn);
      expect(onFlip).toHaveBeenCalledTimes(1);

      // Keyboard flip on card surface
      const card = screen.getByRole("region", { name: /flashcard/i });
      fireEvent.keyDown(card, { key: " " });
      expect(onFlip).toHaveBeenCalledTimes(2);
    });

    it("renders back when flipped is true", () => {
      render(<Flashcard card={sampleCard} flipped={true} onFlip={() => {}} />);
      expect(
        screen.getByText("A bit-for-bit sibling AST preservation rule enforced by RFC 8785 JCS digests.")
      ).toBeDefined();
    });

    it("supports known and unknown marking actions with accessible indicators", () => {
      const onMarkKnown = vi.fn();
      const onMarkUnknown = vi.fn();
      const { rerender } = render(
        <Flashcard
          card={sampleCard}
          onMarkKnown={onMarkKnown}
          onMarkUnknown={onMarkUnknown}
          isKnown={undefined}
        />
      );

      const knownBtn = screen.getByRole("button", { name: "Mark as known" });
      fireEvent.click(knownBtn);
      expect(onMarkKnown).toHaveBeenCalledTimes(1);

      const unknownBtn = screen.getByRole("button", { name: "Mark as unknown" });
      fireEvent.click(unknownBtn);
      expect(onMarkUnknown).toHaveBeenCalledTimes(1);

      // When known, renders badge with icon + label
      rerender(
        <Flashcard
          card={sampleCard}
          isKnown={true}
          onMarkKnown={onMarkKnown}
          onMarkUnknown={onMarkUnknown}
        />
      );
      expect(screen.getByText("Known")).toBeDefined();

      // When unknown, renders badge with icon + label
      rerender(
        <Flashcard
          card={sampleCard}
          isKnown={false}
          onMarkKnown={onMarkKnown}
          onMarkUnknown={onMarkUnknown}
        />
      );
      expect(screen.getAllByText("Still learning").length).toBeGreaterThanOrEqual(1);
    });

    it("supports front and back editing mode with save callback", () => {
      const onSave = vi.fn();
      const onEditToggle = vi.fn();
      render(
        <Flashcard
          card={sampleCard}
          isEditing={true}
          onEditToggle={onEditToggle}
          onSave={onSave}
        />
      );

      const frontInput = screen.getByLabelText("Front");
      const backInput = screen.getByLabelText("Back");
      expect(frontInput).toHaveProperty("value", "What is an invariant in Notebench?");
      expect(backInput).toHaveProperty("value", "A bit-for-bit sibling AST preservation rule enforced by RFC 8785 JCS digests.");

      fireEvent.change(frontInput, { target: { value: "Updated question" } });
      fireEvent.change(backInput, { target: { value: "Updated answer" } });

      const saveBtn = screen.getByRole("button", { name: "Save" });
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledWith({
        front: "Updated question",
        back: "Updated answer",
      });
    });
  });

  describe("QuizQuestion component", () => {
    it("renders prompt and options in radiogroup; allows selection", () => {
      const onSelectOption = vi.fn();
      render(
        <QuizQuestion
          question={sampleQuestion}
          selectedOptionId={undefined}
          onSelectOption={onSelectOption}
        />
      );

      expect(screen.getByText("Which transport protocol is strictly banned in Notebench?")).toBeDefined();
      const options = screen.getAllByRole("radio");
      expect(options).toHaveLength(3);

      fireEvent.click(options[1]!);
      expect(onSelectOption).toHaveBeenCalledWith("c3333333-3333-4333-8333-333333333332");
    });

    it("checks answer and renders correct result with explanation (never color-alone)", () => {
      const onCheckAnswer = vi.fn();
      const { rerender } = render(
        <QuizQuestion
          question={sampleQuestion}
          selectedOptionId="c3333333-3333-4333-8333-333333333332"
          onCheckAnswer={onCheckAnswer}
          isChecked={false}
        />
      );

      const checkBtn = screen.getByRole("button", { name: "Check answer" });
      expect(checkBtn).not.toHaveProperty("disabled", true);
      fireEvent.click(checkBtn);
      expect(onCheckAnswer).toHaveBeenCalledTimes(1);

      // Now re-render in checked state (correct answer)
      rerender(
        <QuizQuestion
          question={sampleQuestion}
          selectedOptionId="c3333333-3333-4333-8333-333333333332"
          isChecked={true}
          scoreLabel="1/1"
        />
      );

      expect(screen.getByText("Correct!")).toBeDefined();
      expect(screen.getByText("Score: 1/1")).toBeDefined();
      expect(screen.getByText(sampleQuestion.explanation)).toBeDefined();
    });

    it("checks answer and renders incorrect result when wrong option selected", () => {
      render(
        <QuizQuestion
          question={sampleQuestion}
          selectedOptionId="c3333333-3333-4333-8333-333333333331"
          isChecked={true}
        />
      );

      expect(screen.getByText("Incorrect")).toBeDefined();
      expect(screen.getByText(sampleQuestion.explanation)).toBeDefined();
    });

    it("supports edit mode for prompt, options and explanation", () => {
      const onSave = vi.fn();
      render(
        <QuizQuestion
          question={sampleQuestion}
          isEditing={true}
          onSave={onSave}
        />
      );

      const promptInput = screen.getByLabelText("Question prompt");
      expect(promptInput).toHaveProperty("value", sampleQuestion.prompt);

      fireEvent.change(promptInput, { target: { value: "Updated prompt" } });
      const saveBtn = screen.getByRole("button", { name: "Save question" });
      fireEvent.click(saveBtn);

      expect(onSave).toHaveBeenCalled();
      const savedData = onSave.mock.calls[0]![0];
      expect(savedData.prompt).toBe("Updated prompt");
      expect(savedData.correctOptionId).toBe(sampleQuestion.correctOptionId);
    });
  });
});
