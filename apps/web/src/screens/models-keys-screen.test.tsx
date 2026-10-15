// @vitest-environment happy-dom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

import { ModelsKeysScreen } from "./models-keys-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface StubRoute {
  match: (url: string, init: RequestInit | undefined) => boolean;
  status: number;
  body: unknown;
}

function stubFetch(routes: StubRoute[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes.find((r) => r.match(url, init));
    const status = route?.status ?? 404;
    const body = route?.body ?? { error: { code: "NOT_FOUND", message: "no stub" } };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const EMPTY_SELECTION = { chat: null, embedding: null };

describe("ModelsKeysScreen (Ticket 04 RED)", () => {
  it("renders all five provider rows with test actions", async () => {
    stubFetch([{ match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION }]);
    const { container } = render(<ModelsKeysScreen />);
    const sections = container.querySelectorAll('section[aria-label$="provider"]');
    expect(sections.length).toBe(5);
    const labels = [...sections].map((s) => s.getAttribute("aria-label"));
    for (const name of ["OpenAI", "Anthropic", "Gemini", "Ollama", "OpenAI-Compatible"]) {
      expect(labels).toContain(`${name} provider`);
    }
    expect(screen.getAllByRole("button", { name: "Test Key" }).length).toBe(5);
  });

  it("shows the cloud disclosure on cloud providers and not on Ollama", async () => {
    stubFetch([{ match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION }]);
    render(<ModelsKeysScreen />);
    await screen.findByText("Models & Keys");
    expect(
      screen.getByText("Your prompts and retrieved passages are transmitted to OpenAI.", { exact: true }),
    ).toBeDefined();
    expect(
      screen.queryByText("Your prompts and retrieved passages are transmitted to Ollama.", { exact: true }),
    ).toBeNull();
  });

  it("a successful key test lists models and reports latency", async () => {
    stubFetch([
      { match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION },
      {
        match: (url, init) => url.includes("/api/providers/openai/test") && init?.method === "POST",
        status: 200,
        body: { ok: true, latencyMs: 12 },
      },
      {
        match: (url, init) => url.includes("/api/providers/openai/models") && (init?.method ?? "GET") === "GET",
        status: 200,
        body: { models: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] },
      },
    ]);
    render(<ModelsKeysScreen />);
    const keyInputs = await screen.findAllByPlaceholderText("Key or token...");
    const openAiKey = keyInputs[0] as HTMLInputElement;
    fireEvent.change(openAiKey, { target: { value: "test-key-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Test Key" })[0] as HTMLElement);
    await screen.findByText("Verified Connected (latency: 12ms)");
    await screen.findByText("gpt-4o-mini");
  });

  it("a failed key test shows the sanitised server message", async () => {
    stubFetch([
      { match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION },
      {
        match: (url, init) => url.includes("/api/providers/openai/test") && init?.method === "POST",
        status: 401,
        body: { error: { code: "UNAUTHORIZED", message: "401 Unauthorized: Invalid API key." } },
      },
    ]);
    render(<ModelsKeysScreen />);
    const keyInputs = await screen.findAllByPlaceholderText("Key or token...");
    fireEvent.change(keyInputs[0] as HTMLInputElement, { target: { value: "bad-key" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Test Key" })[0] as HTMLElement);
    await screen.findByText("401 Unauthorized: Invalid API key.");
  });

  it("a loopback compatible endpoint sends its base URL and hides the cloud badge", async () => {
    const calls = stubFetch([
      { match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION },
      {
        match: (url, init) =>
          url.includes("/api/providers/openai-compatible/test") && init?.method === "POST",
        status: 200,
        body: { ok: true, latencyMs: 8 },
      },
      {
        match: (url) => url.includes("/api/providers/openai-compatible/models"),
        status: 200,
        body: { models: [{ id: "custom-1" }] },
      },
    ]);
    render(<ModelsKeysScreen />);
    const baseInputs = await screen.findAllByPlaceholderText(
      "https://your-provider.example.com/v1",
    );
    const compatBase = baseInputs[1] as HTMLInputElement;
    fireEvent.change(compatBase, { target: { value: "http://127.0.0.1:11435" } });
    const keyInputs = await screen.findAllByPlaceholderText("Key or token...");
    fireEvent.change(keyInputs[4] as HTMLInputElement, { target: { value: "local-key" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Test Key" })[4] as HTMLElement);
    await screen.findByText("custom-1");
    await screen.findByText("Capabilities: not reported by provider");
    expect(
      screen.queryByText(
        "Your prompts and retrieved passages are transmitted to OpenAI-Compatible.",
        { exact: true },
      ),
    ).toBeNull();
    const modelsCall = calls.find((c) => c.url.includes("/api/providers/openai-compatible/models"));
    expect(modelsCall).toBeDefined();
    expect((modelsCall?.init?.headers as Record<string, string>)["x-provider-base-url"]).toBe(
      "http://127.0.0.1:11435",
    );
  });

  it("saving a chat model persists the provider and model id", async () => {
    const calls = stubFetch([
      { match: (url) => url.includes("/api/providers/selection"), status: 200, body: EMPTY_SELECTION },
      {
        match: (url, init) => url.includes("/api/providers/openai/test") && init?.method === "POST",
        status: 200,
        body: { ok: true, latencyMs: 5 },
      },
      {
        match: (url) => url.includes("/api/providers/openai/models"),
        status: 200,
        body: { models: [{ id: "gpt-4o-mini" }] },
      },
      {
        match: (url, init) => url.includes("/api/providers/selection") && init?.method === "PUT",
        status: 200,
        body: { kind: "chat", provider: "openai", modelId: "gpt-4o-mini" },
      },
    ]);
    render(<ModelsKeysScreen />);
    const keyInputs = await screen.findAllByPlaceholderText("Key or token...");
    fireEvent.change(keyInputs[0] as HTMLInputElement, { target: { value: "test-key-2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Test Key" })[0] as HTMLElement);
    await screen.findByText("gpt-4o-mini");
    const openAiSection = document.querySelector('section[aria-label="OpenAI provider"]') as HTMLElement;
    fireEvent.click(within(openAiSection).getByRole("button", { name: "Use for chat" }));
    await waitFor(() => {
      const put = calls.find((c) => c.url.includes("/api/providers/selection") && c.init?.method === "PUT");
      expect(put).toBeDefined();
      expect(String(put?.init?.body)).toContain("gpt-4o-mini");
    });
  });
});
