import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { OpenAiAdapter } from "./adapters/openai.js";
import { ProviderError } from "./types.js";

function randomKey(): string {
  return randomBytes(32).toString("hex");
}

interface FakeRoute {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
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

async function startFakeOpenAi(route: FakeRoute): Promise<{ baseUrl: string; seenAuth: string[] }> {
  const seenAuth: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers.authorization;
    if (typeof auth === "string") {
      seenAuth.push(auth);
    }
    const send = (): void => {
      const headerEntries = Object.entries(route.headers ?? {});
      for (const [k, v] of headerEntries) {
        res.setHeader(k, v);
      }
      res.statusCode = route.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(route.body));
    };
    if (route.delayMs !== undefined && route.delayMs > 0) {
      setTimeout(send, route.delayMs);
    } else {
      send();
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => { resolve(); });
  });
  openServers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fake server did not bind a port");
  }
  return { baseUrl: `http://127.0.0.1:${String(address.port)}`, seenAuth };
}

const OPENAI_LIST_BODY = {
  object: "list",
  data: [
    { id: "gpt-4o-mini", object: "model", created: 1_721_172_717, owned_by: "system" },
    { id: "gpt-4o", object: "model", created: 1_721_172_717, owned_by: "system" },
  ],
};

describe("OpenAiAdapter against fake provider server (Ticket 04 RED, Seam A)", () => {
  it("lists every model from the OpenAI envelope in one page", async () => {
    const { baseUrl, seenAuth } = await startFakeOpenAi({ status: 200, body: OPENAI_LIST_BODY });
    const adapter = new OpenAiAdapter();
    const key = randomKey();
    const models = await adapter.listModels({ baseUrl, apiKey: key });
    expect(models.map((m) => m.id)).toEqual(["gpt-4o-mini", "gpt-4o"]);
    expect(seenAuth).toEqual([`Bearer ${key}`]);
  });

  it.each([
    { status: 401, category: "unauthorized" },
    { status: 403, category: "forbidden" },
    { status: 404, category: "not_found" },
    { status: 429, category: "rate_limited" },
    { status: 500, category: "server_error" },
  ])("maps listModels status $status to $category", async ({ status, category }) => {
    const { baseUrl } = await startFakeOpenAi({
      status,
      body: { error: { message: "provider says no", type: "auth_error" } },
    });
    const adapter = new OpenAiAdapter();
    let failure: unknown = null;
    try {
      await adapter.listModels({ baseUrl, apiKey: randomKey() });
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).category).toBe(category);
    expect((failure as ProviderError).status).toBe(status);
  });

  it("testKey succeeds with measured latency", async () => {
    const { baseUrl } = await startFakeOpenAi({ status: 200, body: OPENAI_LIST_BODY });
    const adapter = new OpenAiAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("testKey maps a 401 to unauthorized with the provider message", async () => {
    const { baseUrl } = await startFakeOpenAi({
      status: 401,
      body: { error: { message: "Invalid API key", type: "auth_error" } },
    });
    const adapter = new OpenAiAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey() });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.category).toBe("unauthorized");
    expect(result.status).toBe(401);
    expect(result.message).toContain("401");
  });

  it("a slow provider surfaces as a categorised timeout", async () => {
    const { baseUrl } = await startFakeOpenAi({ status: 200, body: OPENAI_LIST_BODY, delayMs: 500 });
    const adapter = new OpenAiAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey(), timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("timeout");
    }
  });

  it("a redirect response is refused, never followed", async () => {
    const { baseUrl } = await startFakeOpenAi({
      status: 302,
      body: {},
      headers: { location: "http://127.0.0.1:1/v1/models" },
    });
    const adapter = new OpenAiAdapter();
    const result = await adapter.testKey({ baseUrl, apiKey: randomKey() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("redirect_refused");
    }
  });
});
