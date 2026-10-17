// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { StatusCard } from "./index.js";
import { AlertBanner } from "../primitives/index.js";
import type { HealthProbeResult } from "@notebook/contracts";

afterEach(() => {
  cleanup();
});

const passProbe: HealthProbeResult = {
  id: "node_runtime",
  name: "Node.js Runtime",
  status: "pass",
  message: "Node 22.1.0 meets >= 22.0.0.",
};

describe("health page patterns (issue 23)", () => {
  it("renders a status card with probe name, message and pass badge", () => {
    render(<StatusCard probe={passProbe} />);
    expect(screen.getByText("Node.js Runtime")).toBeDefined();
    expect(screen.getByText("Node 22.1.0 meets >= 22.0.0.")).toBeDefined();
    // Never color-alone: icon + label always.
    expect(screen.getByText("Pass")).toBeDefined();
  });

  it("maps warn and fail to labelled badges", () => {
    const { unmount } = render(
      <StatusCard
        probe={{ ...passProbe, id: "disk_capacity", status: "warn", message: "4 GB free." }}
      />
    );
    expect(screen.getByText("Warning")).toBeDefined();
    unmount();
    render(
      <StatusCard
        probe={{ ...passProbe, id: "exposure", status: "fail", message: "Bound to 0.0.0.0." }}
      />
    );
    expect(screen.getByText("Fail")).toBeDefined();
  });

  it("renders the exposure alert banner with an action", () => {
    let acted = 0;
    render(
      <AlertBanner
        message="Notebench is accessible on your local network."
        actionLabel="Manage access"
        onAction={() => {
          acted += 1;
        }}
      />
    );
    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Manage access" }));
    expect(acted).toBe(1);
  });
});
