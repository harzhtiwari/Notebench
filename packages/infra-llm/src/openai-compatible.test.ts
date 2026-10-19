import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { OpenAiCompatibleAdapter } from "./adapters/openai-compatible.js";
import { providerRegistry } from "./registry.js";

function randomKey(): string {
  return randomBytes(32).toString("hex");
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : (a > b ? 1 : 0);
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

async function startFakeCompat(): Promise<{ baseUrl: string; seenAuth: (string | undefined)[] }> {
  const seenAuth: (string | undefined)[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    seenAuth.push(req.headers.authorization);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        object: "list",
        data: [{ id: "custom-model", object: "model", created: 1, owned_by: "local" }],
      })
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => { resolve(); });
  });
  openServers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fake server did not bind a port");
  }
  return { baseUrl: `http://127.0.0.1:${String(address.port)}/`, seenAuth };
}

describe("OpenAiCompatibleAdapter + registry (Ticket 04 RED, Seam A)", () => {
  it("reads the common /v1/models shape and tolerates a trailing-slash base URL", async () => {
    const { baseUrl, seenAuth } = await startFakeCompat();
    const adapter = new OpenAiCompatibleAdapter();
    const key = randomKey();
    const models = await adapter.listModels({ baseUrl, apiKey: key });
    expect(models.map((m) => m.id)).toEqual(["custom-model"]);
    expect(seenAuth).toEqual([`Bearer ${key}`]);
  });

  it("omits the auth header when no key is configured", async () => {
    const { baseUrl, seenAuth } = await startFakeCompat();
    const adapter = new OpenAiCompatibleAdapter();
    await adapter.listModels({ baseUrl, apiKey: "" });
    expect(seenAuth).toEqual([undefined]);
  });

  it("a redirect response is refused, never followed", async () => {
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 302;
      res.setHeader("location", "http://127.0.0.1:1/v1/models");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({}));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => { resolve(); });
    });
    openServers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Fake server did not bind a port");
    }
    const adapter = new OpenAiCompatibleAdapter();
    const result = await adapter.testKey({
      baseUrl: `http://127.0.0.1:${String(address.port)}`,
      apiKey: randomKey(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("redirect_refused");
    }
  });

  it("the registry holds all five v0.1 providers with Ollama local-only", () => {
    expect(Object.keys(providerRegistry).toSorted(compareCodeUnits)).toEqual([
      "anthropic",
      "gemini",
      "ollama",
      "openai",
      "openai-compatible",
    ]);
    const local = Object.values(providerRegistry).filter((a) => a.isLocal);
    expect(local.map((a) => a.id)).toEqual(["ollama"]);
  });
});
