// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import {
  ArrowLineLeft,
  ArrowLineRight,
  ShieldCheck,
  Info,
  CaretRight,
  CaretDown,
  Circle,
  X,
  PaperPlaneRight,
  Quotes,
  ClockCounterClockwise,
  ArrowUUpLeft,
  Sparkle,
  Slideshow,
  Cards,
  Question,
  ListChecks,
  FlipHorizontal,
  XCircle,
  Download,
  Archive,
  FileZip,
  FileDoc,
  ArrowCounterClockwise,
  Heartbeat,
} from "./index.js";

describe("icon catalog (ticket 01)", () => {
  it.each([
    ["ArrowLineLeft", ArrowLineLeft],
    ["ArrowLineRight", ArrowLineRight],
    ["ShieldCheck", ShieldCheck],
    ["Info", Info],
    ["CaretRight", CaretRight],
    ["CaretDown", CaretDown],
    ["Circle", Circle],
    ["X", X],
  ] as const)("exports %s as a renderable SVG icon", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("icon catalog (Wave-A batch, tickets 10/11/13/14/15/18/19/20/23)", () => {
  it.each(
    [
      ["PaperPlaneRight", PaperPlaneRight],
      ["Quotes", Quotes],
      ["ClockCounterClockwise", ClockCounterClockwise],
      ["ArrowUUpLeft", ArrowUUpLeft],
      ["Sparkle", Sparkle],
      ["Slideshow", Slideshow],
      ["Cards", Cards],
      ["Question", Question],
      ["ListChecks", ListChecks],
      ["FlipHorizontal", FlipHorizontal],
      ["XCircle", XCircle],
      ["Download", Download],
      ["Archive", Archive],
      ["FileZip", FileZip],
      ["FileDoc", FileDoc],
      ["ArrowCounterClockwise", ArrowCounterClockwise],
      ["Heartbeat", Heartbeat],
    ] as const
  )("exports %s as a renderable SVG icon", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
