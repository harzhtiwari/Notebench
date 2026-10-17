// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  Checkbox,
  FormField,
  Input,
  PasswordInput,
  SearchInput,
  SegmentedControl,
  Textarea,
} from "./fields.js";

afterEach(() => {
  cleanup();
});

describe("consolidated fields.tsx (board /* fields */)", () => {
  describe("Input (board .input)", () => {
    it("renders the board shape and accepts typing", () => {
      render(<Input placeholder="Type query..." defaultValue="Initial" />);
      const input = screen.getByPlaceholderText("Type query...") as HTMLInputElement;
      expect(input.value).toBe("Initial");
      expect(input.className).toContain("min-h-[var(--nb-size-control-md)]");
      expect(input.className).toContain("bg-[var(--nb-well)]");
      expect(input.className).toContain("border-[var(--nb-edge)]");
      expect(input.className).toContain("rounded-[var(--nb-radius-input)]");
      fireEvent.change(input, { target: { value: "Updated" } });
      expect(input.value).toBe("Updated");
    });

    it("carries the universal 2px focus ring classes", () => {
      render(<Input aria-label="Notebook name" />);
      const input = screen.getByLabelText("Notebook name");
      expect(input.className).toContain(
        "focus-visible:outline-[length:var(--nb-ring-width)]"
      );
      expect(input.className).toContain("focus-visible:outline-[var(--nb-focus)]");
      expect(input.className).toContain(
        "focus-visible:outline-offset-[var(--nb-ring-offset)]"
      );
    });

    it("binds aria-invalid to the danger border and inset (board .input[aria-invalid])", () => {
      render(<Input aria-label="Base URL" aria-invalid="true" />);
      const input = screen.getByLabelText("Base URL");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.className).toContain("aria-invalid:border-[var(--nb-danger)]");
      expect(input.className).toContain(
        "aria-invalid:shadow-[inset_0_0_0_var(--nb-border-1)_var(--nb-danger)]"
      );
    });

    it("binds disabled styles to the disabled tokens", () => {
      render(<Input aria-label="Set by your admin" disabled />);
      const input = screen.getByLabelText("Set by your admin") as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(input.className).toContain("disabled:bg-[var(--nb-disabled-bg)]");
      expect(input.className).toContain("disabled:text-[var(--nb-disabled-fg)]");
      expect(input.className).toContain("disabled:cursor-not-allowed");
    });
  });

  describe("Textarea (board textarea.input)", () => {
    it("renders the board shape: 80px min height, 8px block padding, vertical resize", () => {
      render(<Textarea aria-label="Note text" />);
      const area = screen.getByLabelText("Note text");
      expect(area.tagName).toBe("TEXTAREA");
      expect(area.className).toContain("min-h-[var(--nb-size-textarea-min)]");
      expect(area.className).toContain("py-[var(--nb-space-2)]");
      expect(area.className).toContain("resize-y");
      expect(area.className).toContain("rounded-[var(--nb-radius-input)]");
    });
  });

  describe("FormField (board .field / .err)", () => {
    it("links the label to the control and wires aria-invalid + aria-describedby on error", () => {
      render(
        <FormField label="Base URL" error="Start the address with http:// or https://">
          <Input id="base-url" />
        </FormField>
      );
      const input = screen.getByLabelText("Base URL");
      expect(input.getAttribute("id")).toBe("base-url");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      const error = screen.getByText("Start the address with http:// or https://");
      expect(error.getAttribute("id")).toBe("base-url-error");
      expect(input.getAttribute("aria-describedby")).toBe("base-url-error");
      expect(error.className).toContain("var(--nb-danger)");
    });

    it("shows the hint only when there is no error", () => {
      const { rerender } = render(
        <FormField label="Web address" hint="Fetched through the web reader.">
          <Input />
        </FormField>
      );
      expect(screen.getByText("Fetched through the web reader.")).toBeDefined();
      rerender(
        <FormField
          label="Web address"
          hint="Fetched through the web reader."
          error="Bad URL"
        >
          <Input />
        </FormField>
      );
      expect(screen.queryByText("Fetched through the web reader.")).toBeNull();
    });

    it("renders the optional metadata chip in the mono font", () => {
      render(
        <FormField label="Notebook name" meta="required">
          <Input />
        </FormField>
      );
      const chip = screen.getByText("required");
      expect(chip.className).toContain("font-mono");
      expect(chip.className).toContain("rounded-[var(--nb-radius-chip)]");
    });

    it("error row uses role=alert and pairs the danger colour with the WarningCircle icon", () => {
      render(
        <FormField label="Passcode" error="Too short">
          <Input />
        </FormField>
      );
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Too short");
      expect(alert.querySelector("svg")).not.toBeNull();
    });
  });

  describe("PasswordInput", () => {
    it("masks by default and unmasks through the IconButton toggle", () => {
      render(<PasswordInput aria-label="Session passcode" />);
      const input = screen.getByLabelText("Session passcode") as HTMLInputElement;
      expect(input.type).toBe("password");
      const toggle = screen.getByRole("button", { name: "Show passcode" });
      fireEvent.click(toggle);
      expect(input.type).toBe("text");
      const hide = screen.getByRole("button", { name: "Hide passcode" });
      expect(hide.getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles back to masked on a second press", () => {
      render(<PasswordInput aria-label="Session passcode" />);
      const input = screen.getByLabelText("Session passcode") as HTMLInputElement;
      fireEvent.click(screen.getByRole("button", { name: "Show passcode" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide passcode" }));
      expect(input.type).toBe("password");
      expect(
        screen.getByRole("button", { name: "Show passcode" })
      ).toBeDefined();
    });
  });

  describe("SearchInput (board .search)", () => {
    it("renders the pill shape with the leading icon and focus-within ring", () => {
      const { container } = render(
        <SearchInput aria-label="Search notebooks" placeholder="Search the web for new sources" />
      );
      const input = screen.getByLabelText("Search notebooks") as HTMLInputElement;
      expect(input.getAttribute("type")).toBe("search");
      expect(container.querySelector("svg")).not.toBeNull();
      const wrapper = input.parentElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toContain("rounded-[var(--nb-radius-control)]");
      expect(wrapper?.className).toContain("bg-[var(--nb-well)]");
      expect(wrapper?.className).toContain("min-h-[var(--nb-size-control-md)]");
      expect(wrapper?.className).toContain(
        "focus-within:outline-[length:var(--nb-ring-width)]"
      );
      expect(wrapper?.className).toContain("focus-within:outline-[var(--nb-focus)]");
    });
  });

  describe("Checkbox (board .check)", () => {
    it("renders a native checkbox: 24px square, ink accent, control-md touch target", () => {
      render(<Checkbox defaultChecked>Use in this task</Checkbox>);
      const box = screen.getByRole("checkbox", { name: "Use in this task" }) as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(box.className).toContain("h-[var(--nb-size-icon-lg)]");
      expect(box.className).toContain("w-[var(--nb-size-icon-lg)]");
      expect(box.className).toContain("accent-[var(--nb-ink)]");
      const wrapper = box.closest("label");
      expect(wrapper?.className).toContain("min-h-[var(--nb-size-control-md)]");
    });

    it("reports toggles through onChange", () => {
      const onChange = vi.fn();
      render(<Checkbox onChange={onChange}>Keep the original file</Checkbox>);
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Keep the original file" })
      );
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("SegmentedControl (board .seg)", () => {
    const OPTIONS = [
      { value: "web", label: "Web" },
      { value: "fast", label: "Fast research" },
      { value: "deep", label: "Deep research" },
    ] as const;

    it("renders radio options in the pill container and reports selection", () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          aria-label="Mode"
          options={OPTIONS}
          value="web"
          onChange={onChange}
        />
      );
      const group = screen.getByRole("group", { name: "Mode" });
      expect(group.className).toContain("rounded-[var(--nb-radius-control)]");
      expect(group.className).toContain("bg-[var(--nb-well)]");
      const web = screen.getByRole("radio", { name: "Web" }) as HTMLInputElement;
      expect(web.checked).toBe(true);
      fireEvent.click(screen.getByRole("radio", { name: "Fast research" }));
      expect(onChange).toHaveBeenCalledWith("fast");
    });

    it("inverts the selected pill to ink/ink-inv via the peer-checked state", () => {
      render(
        <SegmentedControl
          aria-label="Mode"
          options={OPTIONS}
          value="web"
          onChange={() => {}}
        />
      );
      const pill = screen
        .getByRole("radio", { name: "Web" })
        .closest("label")
        ?.querySelector("span");
      expect(pill?.className).toContain("peer-checked:bg-[var(--nb-ink)]");
      expect(pill?.className).toContain("peer-checked:text-[var(--nb-ink-inv)]");
    });
  });
});
