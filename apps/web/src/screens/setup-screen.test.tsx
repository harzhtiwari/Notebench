// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Ticket 01 UI RED suite (written before setup-screen exists).
// Follows the pinned shell contract from shell/app-root.test.tsx: the screen
// renders `Complete Setup` + `[data-testid="setup-form"]` optimistically, even
// before/unless the app-state probe answers (the daemon's atomic 409 guard is
// the real duplicate-owner protection).
import { SetupScreen } from "./setup-screen";

interface Call {
  url: string;
  init?: RequestInit | undefined;
}

type Handler = (call: Call) => Promise<unknown>;

function stubFetch(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = { url, init };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

function okBody(body: unknown): unknown {
  return { ok: true, json: async () => body };
}

function errorBody(status: number, body: unknown): unknown {
  return { ok: false, status, json: async () => body };
}

/**
Reads the JSON body a stubbed request received; every stub here posts JSON text.
*/
function jsonBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new TypeError("Expected a JSON string request body.");
  }
  return JSON.parse(body);
}

const SETUP_FORM_SELECTOR = '[data-testid="setup-form"]';

function typeInto(input: HTMLInputElement | null, value: string): void {
  if (input === null) {
    throw new Error("Expected the input element to be rendered.");
  }
  fireEvent.change(input, { target: { value } });
}

function submitForm(): void {
  const button = screen.getByRole("button", { name: /Create (workspace|account)/i });
  expect(button).not.toBeNull();
  fireEvent.click(button);
}

function passcodeInput(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#setup-passcode");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("setup screen (ticket 01 UI)", () => {
  it("renders the pinned form optimistically before the probe answers", () => {
    // No fetch stub: the live probe may be in flight, never blocking first paint.
    const { container } = render(<SetupScreen navigate={vi.fn()} />);
    expect(screen.getByText("Complete Setup")).not.toBeNull();
    expect(container.querySelector(SETUP_FORM_SELECTOR)).not.toBeNull();
  });

  it("navigates to /login when setup completed and a passcode is set", async () => {
    stubFetch(async () =>
      okBody({ setupComplete: true, requiresPasscode: true, signInRequired: true }),
    );
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
  });

  it("navigates to /login when only sign-in is required", async () => {
    stubFetch(async () =>
      okBody({ setupComplete: true, requiresPasscode: false, signInRequired: true }),
    );
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
  });

  it("navigates to / when setup completed with no sign-in", async () => {
    stubFetch(async () =>
      okBody({ setupComplete: true, requiresPasscode: false, signInRequired: false }),
    );
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
  });

  it("keeps the form and shows a warn banner when the probe fails", async () => {
    stubFetch(async () => {
      throw new Error("connection refused");
    });
    const { container } = render(<SetupScreen navigate={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Status check failed")).not.toBeNull();
    });
    expect(container.querySelector(SETUP_FORM_SELECTOR)).not.toBeNull();
  });

  it("blocks the submit client-side when the passcode is shorter than 15", async () => {
    const calls = stubFetch(async () => okBody({}));
    const { container } = render(<SetupScreen navigate={vi.fn()} />);
    typeInto(passcodeInput(container), "short");
    submitForm();
    expect(
      screen.getByText("Passcode must be at least 15 characters long."),
    ).not.toBeNull();
    expect(
      calls.some((call) => call.init?.method === "POST"),
    ).toBe(false);
  });

  it("blocks the submit client-side when confirmation passcode does not match", async () => {
    const calls = stubFetch(async () => okBody({}));
    const { container } = render(<SetupScreen navigate={vi.fn()} />);
    typeInto(passcodeInput(container), "correct horse battery stallion");
    typeInto(container.querySelector<HTMLInputElement>("#setup-passcode-confirm"), "different passcode altogether");
    submitForm();
    expect(screen.getByText("Passcodes do not match.")).not.toBeNull();
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("allows skipping passcode directly via skip action", async () => {
    const calls = stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          okBody({
            owner: {
              id: "u-1",
              email: null,
              displayName: "Solo",
              role: "owner",
              hasPasscode: false,
              createdAt: "2026-10-17T00:00:00.000Z",
            },
          }),
        );
      }
      return Promise.resolve(
        okBody({ setupComplete: false, requiresPasscode: false, signInRequired: false }),
      );
    });
    const navigate = vi.fn();
    const { container } = render(<SetupScreen navigate={navigate} />);
    typeInto(container.querySelector<HTMLInputElement>("#setup-display-name"), "Solo");
    typeInto(passcodeInput(container), "a long passcode that will be ignored");
    const skipBtn = screen.getByRole("button", { name: /Skip the passcode/i });
    fireEvent.click(skipBtn);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
    const post = calls.find((call) => call.init?.method === "POST");
    expect(post).not.toBeNull();
    expect(jsonBody(post?.init)).toEqual({
      displayName: "Solo",
    });
  });

  it("posts the trimmed values and navigates to /login when a passcode is set", async () => {
    const calls = stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          okBody({
            owner: {
              id: "u-1",
              email: "ada@example.com",
              displayName: "Ada",
              role: "owner",
              hasPasscode: true,
              createdAt: "2026-10-17T00:00:00.000Z",
            },
          }),
        );
      }
      return Promise.resolve(
        okBody({ setupComplete: false, requiresPasscode: false, signInRequired: false }),
      );
    });
    const navigate = vi.fn();
    const { container } = render(<SetupScreen navigate={navigate} />);
    typeInto(container.querySelector<HTMLInputElement>("#setup-display-name"), "  Ada  ");
    typeInto(container.querySelector<HTMLInputElement>("#setup-email"), "ada@example.com");
    typeInto(passcodeInput(container), "correct horse battery stallion");
    submitForm();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    const post = calls.find((call) => call.init?.method === "POST");
    expect(post).not.toBeNull();
    expect(post?.url).toBe("/api/setup");
    expect(jsonBody(post?.init)).toEqual({
      displayName: "Ada",
      email: "ada@example.com",
      passcode: "correct horse battery stallion",
    });
  });

  it("omits empty fields from the POST body and goes to / with no passcode", async () => {
    const calls = stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          okBody({
            owner: {
              id: "u-1",
              email: null,
              displayName: null,
              role: "owner",
              hasPasscode: false,
              createdAt: "2026-10-17T00:00:00.000Z",
            },
          }),
        );
      }
      return Promise.resolve(
        okBody({ setupComplete: false, requiresPasscode: false, signInRequired: false }),
      );
    });
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    submitForm();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
    const post = calls.find((call) => call.init?.method === "POST");
    expect(post).not.toBeNull();
    expect(jsonBody(post?.init)).toEqual({});
  });

  it("handles SETUP_ALREADY_COMPLETED by re-probing: /login when a passcode is set", async () => {
    let probeCount = 0;
    stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          errorBody(409, {
            error: { code: "SETUP_ALREADY_COMPLETED", message: "Owner exists." },
          }),
        );
      }
      probeCount += 1;
      // First GET is the mount probe; the second is the post-409 re-probe.
      return Promise.resolve(
        okBody(
          probeCount === 1
            ? { setupComplete: false, requiresPasscode: false, signInRequired: false }
            : { setupComplete: true, requiresPasscode: true, signInRequired: true },
        ),
      );
    });
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    submitForm();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("handles SETUP_ALREADY_COMPLETED by re-probing: / when the owner has no passcode", async () => {
    let probeCount = 0;
    stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          errorBody(409, {
            error: { code: "SETUP_ALREADY_COMPLETED", message: "Owner exists." },
          }),
        );
      }
      probeCount += 1;
      // First GET is the mount probe; the second is the post-409 re-probe.
      return Promise.resolve(
        okBody(
          ({ setupComplete: probeCount === 1 ? false : true, requiresPasscode: false, signInRequired: false }),
        ),
      );
    });
    const navigate = vi.fn();
    render(<SetupScreen navigate={navigate} />);
    submitForm();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("maps server field issues onto the inputs and preserves typed values", async () => {
    stubFetch(call => {
      if (call.init?.method === "POST") {
        return Promise.resolve(
          errorBody(400, {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid setup parameters",
              details: {
                issues: [
                  {
                    path: ["passcode"],
                    message: "This passcode appears on a known breached list.",
                  },
                ],
              },
            },
          }),
        );
      }
      return Promise.resolve(
        okBody({ setupComplete: false, requiresPasscode: false, signInRequired: false }),
      );
    });
    const navigate = vi.fn();
    const { container } = render(<SetupScreen navigate={navigate} />);
    typeInto(passcodeInput(container), "ordinary venerable passcode");
    submitForm();
    await waitFor(() => {
      expect(
        screen.getByText("This passcode appears on a known breached list."),
      ).not.toBeNull();
    });
    expect(passcodeInput(container)?.value).toBe("ordinary venerable passcode");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows an error banner when the POST fails at the network level", async () => {
    stubFetch(call => {
      if (call.init?.method === "POST") {
        throw new Error("connection refused");
      }
      return Promise.resolve(
        okBody({ setupComplete: false, requiresPasscode: false, signInRequired: false }),
      );
    });
    const { container } = render(<SetupScreen navigate={vi.fn()} />);
    typeInto(passcodeInput(container), "ordinary venerable passcode");
    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Setup failed. Check the daemon and try again.")).not.toBeNull();
    });
    expect(passcodeInput(container)?.value).toBe("ordinary venerable passcode");
  });
});
