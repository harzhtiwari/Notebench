// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { LoginScreen } from "./login-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  );
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("login screen (ticket 02)", () => {
  it("presents the lockscreen when the daemon requires a passcode", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/app-state")) {
        return json({ setupComplete: true, requiresPasscode: true });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    render(<LoginScreen navigate={() => {}} />);
    await screen.findByRole("dialog", { name: "Unlock Notebench" });
    expect(screen.getByLabelText("Passcode")).toBeDefined();
  });

  it("redirects to setup when the owner is not configured", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/app-state")) {
        return json({ setupComplete: false, requiresPasscode: false });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const seen: Array<string> = [];
    render(<LoginScreen navigate={(to) => seen.push(to)} />);
    await waitFor(() => {
      expect(seen).toEqual(["/setup"]);
    });
  });

  it("signs in with the passcode and leaves for the workspace", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/app-state")) {
        return json({ setupComplete: true, requiresPasscode: true });
      }
      if (url.endsWith("/api/session/login") && init?.method === "POST") {
        return json({ success: true, sessionRequired: true });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const seen: Array<string> = [];
    render(<LoginScreen navigate={(to) => seen.push(to)} />);
    await screen.findByRole("dialog", { name: "Unlock Notebench" });

    fireEvent.change(screen.getByLabelText("Passcode"), {
      target: { value: "a-very-secure-passcode-phrase-here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(seen).toEqual(["/"]);
    });
  });

  it("surfaces wrong-passcode errors and the lockout countdown", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/app-state")) {
        return json({ setupComplete: true, requiresPasscode: true });
      }
      if (url.endsWith("/api/session/login") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { passcode: string };
        if (body.passcode === "locked-out") {
          return json(
            {
              error: {
                code: "RATE_LIMITED",
                message: "Too many failed passcode attempts.",
                details: { retryAfterSeconds: 60, locked: true },
              },
            },
            429
          );
        }
        return json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Incorrect passcode.",
              details: { attemptsRemaining: 3 },
            },
          },
          401
        );
      }
      throw new Error(`unexpected request: ${url}`);
    });

    render(<LoginScreen navigate={() => {}} />);
    await screen.findByRole("dialog", { name: "Unlock Notebench" });

    fireEvent.change(screen.getByLabelText("Passcode"), {
      target: { value: "wrong-passphrase-here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("Incorrect passcode.");
    // The shared modal gives the error precedence over the attempts hint.
    expect(screen.queryByText("3 attempts remaining.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Passcode"), {
      target: { value: "locked-out" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByText("Too many failed passcode attempts.");
    expect(screen.getByRole("status").textContent).toContain("1:00");
  });
});
