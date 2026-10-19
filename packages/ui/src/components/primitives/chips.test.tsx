// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { Chip, KeywordFallbackChip } from "./chips.js";

afterEach(() => {
  cleanup();
});

describe("Chip", () => {
  it("renders the board .chip shape with control-sm height and pointer cursor", () => {
    render(<Chip>PDFs 1</Chip>);
    const chip = screen.getByRole("button", { name: "PDFs 1" });
    expect(chip.className).toContain("min-h-[var(--nb-size-control-sm)]");
    expect(chip.className).toContain("rounded-[var(--nb-radius-chip)]");
    expect(chip.className).toContain("cursor-pointer");
    expect(chip.className).toContain("hover:bg-[var(--nb-well-hover)]");
    expect(chip.getAttribute("type")).toBe("button");
  });

  it("reflects the pressed state through aria-pressed and the ink fill", () => {
    render(<Chip pressed>Selected</Chip>);
    const chip = screen.getByRole("button", { name: "Selected" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.className).toContain("aria-pressed:bg-[var(--nb-ink)]");
    expect(chip.className).toContain("aria-pressed:text-[var(--nb-ink-inv)]");
  });

  it("omits aria-pressed when the pressed prop is absent", () => {
    render(<Chip>Idle</Chip>);
    expect(
      screen.getByRole("button", { name: "Idle" }).getAttribute("aria-pressed")
    ).toBeNull();
  });

  it("renders the warn soft-cap variant with warn wash and semibold text", () => {
    render(<Chip variant="warn">50+ sources</Chip>);
    const chip = screen.getByRole("button", { name: "50+ sources" });
    expect(chip.className).toContain("bg-[var(--nb-warn-wash)]");
    expect(chip.className).toContain("text-[var(--nb-warn)]");
    expect(chip.className).toContain("font-semibold");
  });

  it("fires onClick and honours a caller-supplied type", () => {
    const onClick = vi.fn();
    render(
      <Chip type="submit" onClick={onClick}>
        Run
      </Chip>
    );
    const chip = screen.getByRole("button", { name: "Run" });
    expect(chip.getAttribute("type")).toBe("submit");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-operable as a native button", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Keyboard</Chip>);
    const chip = screen.getByRole("button", { name: "Keyboard" });
    chip.focus();
    expect(document.activeElement).toBe(chip);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("merges custom className", () => {
    render(<Chip className="chip-extra">Extra</Chip>);
    expect(screen.getByRole("button", { name: "Extra" }).className).toContain(
      "chip-extra"
    );
  });
});

describe("KeywordFallbackChip", () => {
  it("renders the default keyword-search label with a warning icon (never color-alone)", () => {
    const { container } = render(<KeywordFallbackChip />);
    const chip = screen.getByRole("button", {
      name: /Keyword Search Only/i,
    });
    expect(chip.textContent).toContain("Keyword Search Only");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("appends the detail suffix and uses it as the tooltip title", () => {
    render(<KeywordFallbackChip detail="3 sources" />);
    const chip = screen.getByRole("button", { name: /Keyword Search Only/ });
    expect(chip.textContent).toContain("3 sources");
    expect(chip.getAttribute("title")).toBe("3 sources");
  });

  it("falls back to the API-key hint title when no detail is given", () => {
    render(<KeywordFallbackChip />);
    expect(
      screen.getByRole("button", { name: /Keyword Search Only/ }).getAttribute("title")
    ).toBe("Add an API key or enable local worker for semantic search");
  });

  it("prefers custom children over generated copy", () => {
    render(<KeywordFallbackChip label="Fallback" detail="2 sources">Custom copy</KeywordFallbackChip>);
    const chip = screen.getByRole("button", { name: /Custom copy/ });
    expect(chip.textContent).toContain("Custom copy");
    expect(chip.textContent).not.toContain("Fallback");
  });

  it("carries the warn chip treatment", () => {
    render(<KeywordFallbackChip />);
    const chip = screen.getByRole("button", { name: /Keyword Search Only/ });
    expect(chip.className).toContain("bg-[var(--nb-warn-wash)]");
    expect(chip.className).toContain("text-[var(--nb-warn)]");
  });
});
