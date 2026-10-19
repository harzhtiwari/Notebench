import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { GeminiAdapter } from "./adapters/gemini.js";
import { ProviderError } from "./types.js";

function randomKey(): string {
  return randomBytes(32).toString("hex");
}

interface SeenRequest {
  url: string;
  headerKey: string | undefined;
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

async function startFakeGemini(
  pages: Record<string, unknown>
): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    seen.push({ url: req.url ?? "", headerKey: req.headers["x-goog-api-key"] as string | undefined });
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const key = url.searchParams.get("pageToken") ?? "first";
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
  models: [
    {
      name: "models/gemini-2.0-flash",
      displayName: "Gemini 2.0 Flash",
      supportedGenerationMethods: ["generateContent"],
      inputTokenLimit: 1_048_576,
    },
  ],
  nextPageToken: "token-2",
};

const PAGE_2 = {
  models: [{ name: "models/gemini-embedding-001", displayName: "Embedding 001" }],
};

describe("GeminiAdapter against fake provider server (Ticket 04 RED, Seam A)", () => {
  it("pages with pageToken and sends the key as x-goog-api-key", async () => {
    const { baseUrl, seen } = await startFakeGemini({ first: PAGE_1, "token-2": PAGE_2 });
    const adapter = new GeminiAdapter();
    const key = randomKey();
    const models = await adapter.listModels({ baseUrl, apiKey: key });
    expect(models.map((m) => m.id)).toEqual([
      "models/gemini-2.0-flash",
      "models/gemini-embedding-001",
    ]);
    expect(seen.length).toBe(2);
    expect(seen[0]?.headerKey).toBe(key);
    expect(seen[1]?.url).toContain("pageToken=token-2");
    expect(models[0]?.displayName).toBe("Gemini 2.0 Flash");
    expect(models[0]?.capabilities).toMatchObject({
      supportedGenerationMethods: ["generateContent"],
    });
  });

  it("stops when nextPageToken is absent", async () => {
    const { baseUrl, seen } = await startFakeGemini({ first: PAGE_2 });
    const adapter = new GeminiAdapter();
    const models = await adapter.listModels({ baseUrl, apiKey: randomKey() });
    expect(models.length).toBe(1);
    expect(seen.length).toBe(1);
  });

  it("testKey pings one minimal page", async () => {
    const { baseUrl, seen } = await startFakeGemini({ first: PAGE_1 });
    const adapter = new GeminiAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey() });
    expect(result.ok).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]?.url).toContain("pageSize=1");
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
      res.end(JSON.stringify({ error: { message: "nope" } }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => { resolve(); });
    });
    openServers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Fake server did not bind a port");
    }
    const adapter = new GeminiAdapter();
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
