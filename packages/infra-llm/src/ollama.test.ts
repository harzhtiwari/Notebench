import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { OllamaAdapter } from "./adapters/ollama.js";

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

async function startFakeOllama(body: unknown): Promise<{ baseUrl: string; authSeen: boolean }> {
  let isAuthSeen = false;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== undefined) {
      isAuthSeen = true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => { resolve(); });
  });
  openServers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fake server did not bind a port");
  }
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    get authSeen() {
      return isAuthSeen;
    },
  };
}

describe("OllamaAdapter against fake local server (Ticket 04 RED, Seam A)", () => {
  it("lists locally installed models from /api/tags with no auth header", async () => {
    const fake = await startFakeOllama({
      models: [
        { name: "llama3.2:latest", model: "llama3.2" },
        { name: "nomic-embed-text:latest", model: "nomic-embed-text" },
      ],
    });
    const adapter = new OllamaAdapter();
    const models = await adapter.listModels({ baseUrl: fake.baseUrl, apiKey: "" });
    expect(models.map((m) => m.id)).toEqual(["llama3.2:latest", "nomic-embed-text:latest"]);
    expect(fake.authSeen).toBe(false);
  });

  it("an empty model list means reachable-but-empty, still ok", async () => {
    const fake = await startFakeOllama({ models: [] });
    const adapter = new OllamaAdapter();
    const result = await adapter.testKey({ baseUrl: fake.baseUrl, apiKey: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("a refused connection surfaces as network_error, not a hang", async () => {
    const adapter = new OllamaAdapter();
    const result = await adapter.testKey({
      baseUrl: "http://127.0.0.1:1",
      apiKey: "",
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("network_error");
    }
  });
});
