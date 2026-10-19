import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { ProviderError } from "./types.js";

function randomKey(): string {
  return randomBytes(32).toString("hex");
}

interface SeenRequest {
  url: string;
  apiKey: string | undefined;
  version: string | undefined;
}

const openServers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => { resolve(); });
        })
    )
  );
});

async function startFakeAnthropic(
  pages: Record<string, unknown>
): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    seen.push({
      url: req.url ?? "",
      apiKey: req.headers["x-api-key"] as string | undefined,
      version: req.headers["anthropic-version"] as string | undefined,
    });
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const key = url.searchParams.get("after_id") ?? "first";
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(pages[key] ?? pages["first"]));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => { resolve(); });
  });
  openServers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fake server did not bind a port");
  }
  return { baseUrl: `http://127.0.0.1:${String(address.port)}`, seen };
}

const PAGE_1 = {
  data: [
    {
      type: "model",
      id: "claude-sonnet-4-5",
      display_name: "Claude Sonnet 4.5",
      capabilities: { image_input: { supported: true } },
    },
  ],
  first_id: "claude-sonnet-4-5",
  last_id: "claude-sonnet-4-5",
  has_more: true,
};

const PAGE_2 = {
  data: [{ type: "model", id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" }],
  first_id: "claude-haiku-4-5",
  last_id: "claude-haiku-4-5",
  has_more: false,
};

describe("AnthropicAdapter against fake provider server (Ticket 04 RED, Seam A)", () => {
  it("pages with after_id until has_more is false and sends both headers", async () => {
    const { baseUrl, seen } = await startFakeAnthropic({ first: PAGE_1, "claude-sonnet-4-5": PAGE_2 });
    const adapter = new AnthropicAdapter();
    const key = randomKey();
    const models = await adapter.listModels({ baseUrl, apiKey: key });
    expect(models.map((m) => m.id)).toEqual(["claude-sonnet-4-5", "claude-haiku-4-5"]);
    expect(seen.length).toBe(2);
    expect(seen[0]?.apiKey).toBe(key);
    expect(seen[0]?.version).toBe("2023-06-01");
    expect(seen[1]?.url).toContain("after_id=claude-sonnet-4-5");
    expect(models[0]?.displayName).toBe("Claude Sonnet 4.5");
    expect(models[0]?.capabilities).toEqual({ image_input: { supported: true } });
  });

  it("testKey pings one minimal page and reports latency", async () => {
    const { baseUrl, seen } = await startFakeAnthropic({ first: PAGE_1 });
    const adapter = new AnthropicAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey() });
    expect(result.ok).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]?.url).toContain("limit=1");
  });

  it.each([
    { status: 401, category: "unauthorized" },
    { status: 403, category: "forbidden" },
    { status: 404, category: "not_found" },
    { status: 429, category: "rate_limited" },
    { status: 500, category: "server_error" },
  ])("maps listModels status $status to $category", async ({ status, category }) => {
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "nope" } }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => { resolve(); });
    });
    openServers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Fake server did not bind a port");
    }
    const adapter = new AnthropicAdapter();
    let failure: unknown = null;
    try {
      await adapter.listModels({
        baseUrl: `http://127.0.0.1:${String(address.port)}`,
        apiKey: randomKey(),
      });
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).category).toBe(category);
  });
});
