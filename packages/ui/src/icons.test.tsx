// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import {
  ArrowLineLeft,
  ArrowLineRight,
  ShieldCheck,
  Info,
  CaretRight,
  Circle,
} from "./index.js";

describe("icon catalog (ticket 01)", () => {
  it.each([
    ["ArrowLineLeft", ArrowLineLeft],
    ["ArrowLineRight", ArrowLineRight],
    ["ShieldCheck", ShieldCheck],
    ["Info", Info],
    ["CaretRight", CaretRight],
    ["Circle", Circle],
  ] as const)("exports %s as a renderable SVG icon", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
