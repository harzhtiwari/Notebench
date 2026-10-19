// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { Composer, RefusalEmpty } from "./index.js";
import { KeywordFallbackChip } from "../primitives/chips.js";

afterEach(() => {
  cleanup();
});

describe("chat composer patterns (ticket 10)", () => {
  describe("Composer", () => {
    it("renders input, placeholder and send button with PaperPlaneRight icon", () => {
      const { container } = render(
        <Composer placeholder="Ask a question or create something" />
      );
      const input = screen.getByPlaceholderText("Ask a question or create something");
      expect(input).toBeDefined();
      const sendButton = screen.getByRole("button", { name: "Send" });
      expect(sendButton).toBeDefined();
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("submits on clicking send button and clears uncontrolled input", () => {
      const onSend = vi.fn();
      render(<Composer onSend={onSend} />);
      const input = screen.getByRole("textbox");
      const sendButton = screen.getByRole("button", { name: "Send" });

      // Initially empty -> send button is disabled
      expect(sendButton.hasAttribute("disabled")).toBe(true);

      fireEvent.change(input, { target: { value: "Summarize Q3 churn" } });
      expect(sendButton.hasAttribute("disabled")).toBe(false);

      fireEvent.click(sendButton);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("Summarize Q3 churn");
      expect((input as HTMLInputElement).value).toBe("");
    });

    it("submits on pressing Enter (without Shift)", () => {
      const onSend = vi.fn();
      render(<Composer onSend={onSend} defaultValue="What are the key findings?" />);
      const input = screen.getByRole("textbox");

      fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("What are the key findings?");
    });

    it("does not submit on Shift+Enter", () => {
      const onSend = vi.fn();
      render(<Composer onSend={onSend} defaultValue="Multiline query" />);
      const input = screen.getByRole("textbox");

      fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
      expect(onSend).not.toHaveBeenCalled();
    });

    it("disables input and send button when disabled", () => {
      const onSend = vi.fn();
      render(<Composer disabled onSend={onSend} defaultValue="Blocked prompt" />);
      const input = screen.getByRole("textbox");
      const sendButton = screen.getByRole("button", { name: "Send" });

      expect(input.hasAttribute("disabled")).toBe(true);
      expect(sendButton.hasAttribute("disabled")).toBe(true);

      fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
      fireEvent.click(sendButton);
      expect(onSend).not.toHaveBeenCalled();
    });

    it("renders secondary row when children are provided", () => {
      render(
        <Composer>
          <span data-testid="source-count">3 sources</span>
        </Composer>
      );
      expect(screen.getByTestId("source-count").textContent).toBe("3 sources");
    });

    it("forwards div props to the root and keeps internal state when inputProps.onChange is supplied", () => {
      const onSend = vi.fn();
      const inputOnChange = vi.fn();
      render(
        <Composer
          data-testid="composer-root"
          inputProps={{ onChange: inputOnChange }}
          onSend={onSend}
        />
      );

      expect(screen.getByTestId("composer-root")).toBeDefined();

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Hello" } });

      expect((input as HTMLInputElement).value).toBe("Hello");
      expect(inputOnChange).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false);
    });
  });

  describe("KeywordFallbackChip", () => {
    it("renders with default label and warning icon", () => {
      const { container } = render(<KeywordFallbackChip />);
      const chip = screen.getByRole("button");
      expect(chip.textContent).toContain("Keyword Search Only…");
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("renders detailed label and responds to click", () => {
      const onClick = vi.fn();
      render(
        <KeywordFallbackChip
          label="Keyword Search Only"
          detail="Add an API key or enable local worker for semantic search"
          onClick={onClick}
        />
      );
      const chip = screen.getByRole("button");
      expect(chip.textContent).toContain("Keyword Search Only · Add an API key");
      fireEvent.click(chip);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("RefusalEmpty", () => {
    it("renders Tier-1 refusal empty state for no sources", () => {
      render(<RefusalEmpty reason="no-sources" />);
      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "No sources selected"
      );
      expect(screen.getByText(/Select at least one source/)).toBeDefined();
    });

    it("renders Tier-1 refusal empty state for low confidence with topic", () => {
      render(
        <RefusalEmpty
          reason="low-confidence"
          topic="quantum computing"
          availableTopics={["revenue growth", "churn analysis"]}
        />
      );
      expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(
        "Not found in sources"
      );
      expect(
        screen.getByText(/quantum computing/)
      ).toBeDefined();
      expect(
        screen.getByText(/revenue growth, churn analysis/)
      ).toBeDefined();
    });

    it("renders action button and triggers callback", () => {
      const onAction = vi.fn();
      render(
        <RefusalEmpty
          reason="no-sources"
          actionLabel="Select all sources"
          onAction={onAction}
        />
      );
      const actionBtn = screen.getByRole("button", { name: "Select all sources" });
      fireEvent.click(actionBtn);
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
