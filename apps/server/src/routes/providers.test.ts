import { describe, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { EncryptedVault, MemoryVaultStorage } from "@notebench/infra-vault";
import {
  createSqliteDatabase,
  initializeSqliteSchema,
  SqliteModelSelectionRepository,
  SqliteVaultKeyRepository,
} from "@notebench/infra-db";
import type {
  ModelRef,
  ProviderAdapter,
  ProviderCallParams,
  ProviderId,
  TestKeyResult,
} from "@notebench/infra-llm";
import { providersRoutes, type ModelSelectionStore } from "./providers.js";
import { buildServer } from "../app.js";
import { SqliteVaultStorage } from "../vault-storage.js";

function randomKey(): string {
  return randomBytes(32).toString("hex");
}

class ScriptedAdapter implements ProviderAdapter {
  readonly id: ProviderId = "openai";
  readonly defaultBaseUrl = "https://api.openai.com";
  readonly isLocal = false;
  readonly calls: ProviderCallParams[] = [];
  constructor(
    private readonly testResult: (key: string) => TestKeyResult,
    private readonly models: readonly ModelRef[] = [{ id: "scripted-model" }]
  ) {}
  async testKey(params: ProviderCallParams): Promise<TestKeyResult> {
    this.calls.push(params);
    return this.testResult(params.apiKey);
  }
  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    this.calls.push(params);
    return this.models;
  }
}

class MemorySelections implements ModelSelectionStore {
  private readonly rows = new Map<string, { provider: string; modelId: string }>();
  async save(selection: { userId: string; kind: "chat" | "embedding"; provider: string; modelId: string }): Promise<void> {
    this.rows.set(`${selection.userId}:${selection.kind}`, {
      provider: selection.provider,
      modelId: selection.modelId,
    });
  }
  async get(
    userId: string,
    kind: "chat" | "embedding"
  ): Promise<{ provider: string; modelId: string } | null> {
    return this.rows.get(`${userId}:${kind}`) ?? null;
  }
}

async function buildTestServer(adapter: ProviderAdapter) {
  const app = Fastify({ logger: false });
  const vault = new EncryptedVault(randomBytes(32), new MemoryVaultStorage());
  const selections = new MemorySelections();
  const userId = randomUUID();
  await app.register(providersRoutes, {
    adapters: { openai: adapter },
    vault,
    selections,
    defaultUserId: userId,
  });
  await app.ready();
  return { app, vault, selections, userId };
}

describe("providers routes (Ticket 04 RED, Seam B)", () => {
  it("POST test returns latency and never the key", async () => {
    const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 42 }));
    const { app } = await buildTestServer(adapter);
    const key = randomKey();
    const res = await app.inject({
      method: "POST",
      url: "/api/providers/openai/test",
      payload: { apiKey: key },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, latencyMs: 42 });
    expect(res.body).not.toContain(key);
    await app.close();
  });

  it("scrubs a key echoed in a provider error message", async () => {
    const adapter = new ScriptedAdapter((key) => ({
      ok: false,
      category: "unauthorized",
      status: 401,
      message: `401 Unauthorized: bad key ${key}`,
    }));
    const { app } = await buildTestServer(adapter);
    const key = randomKey();
    const res = await app.inject({
      method: "POST",
      url: "/api/providers/openai/test",
      payload: { apiKey: key },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).not.toContain(key);
    expect(body.error.message).toContain("[REDACTED]");
    await app.close();
  });

  it("allows an empty key for local providers (Ollama connection test)", async () => {
    const local: ProviderAdapter = {
      id: "ollama",
      defaultBaseUrl: "http://localhost:11434",
      isLocal: true,
      testKey: async () => ({ ok: true, latencyMs: 3 }),
      listModels: async () => [{ id: "llama3.2:latest" }],
    };
    const app = Fastify({ logger: false });
    const userId = randomUUID();
    await app.register(providersRoutes, {
      adapters: { ollama: local },
      vault: new EncryptedVault(randomBytes(32), new MemoryVaultStorage()),
      selections: new MemorySelections(),
      defaultUserId: userId,
    });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/providers/ollama/test",
      payload: { apiKey: "" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, latencyMs: 3 });
    await app.close();
  });

  it("rejects unknown providers with NOT_FOUND", async () => {
    const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 1 }));
    const { app } = await buildTestServer(adapter);
    const res = await app.inject({
      method: "POST",
      url: "/api/providers/nope/test",
      payload: { apiKey: randomKey() },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("POST key stores in the vault and returns the mask only", async () => {
    const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 1 }));
    const { app } = await buildTestServer(adapter);
    const key = randomKey();
    const res = await app.inject({
      method: "POST",
      url: "/api/providers/openai/key",
      payload: { apiKey: key },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ provider: string; keyId: string; maskedKey: string }>();
    expect(body.provider).toBe("openai");
    expect(body.maskedKey).toContain(key.slice(-4));
    expect(res.body).not.toContain(key);
    await app.close();
  });

  it("GET models with a saved keyId calls the provider with vault plaintext", async () => {
    const seen: string[] = [];
    const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 1 }), [{ id: "listed-model" }]);
    const rawListModels = adapter.listModels.bind(adapter);
    adapter.listModels = async (params) => {
      seen.push(params.apiKey);
      return rawListModels(params);
    };
    const { app } = await buildTestServer(adapter);
    const key = randomKey();
    await app.inject({
      method: "POST",
      url: "/api/providers/openai/key",
      payload: { apiKey: key, keyId: "models-key" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/providers/openai/models?keyId=models-key",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ models: [{ id: "listed-model" }] });
    expect(seen).toEqual([key]);
    expect(res.body).not.toContain(key);
    await app.close();
  });

  it("chat and embedding selections persist independently", async () => {
    const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 1 }));
    const { app } = await buildTestServer(adapter);
    const chatId = `chat-${randomBytes(4).toString("hex")}`;
    const embedId = `embed-${randomBytes(4).toString("hex")}`;
    await app.inject({
      method: "PUT",
      url: "/api/providers/selection",
      payload: { kind: "chat", provider: "openai", modelId: chatId },
    });
    await app.inject({
      method: "PUT",
      url: "/api/providers/selection",
      payload: { kind: "embedding", provider: "openai", modelId: embedId },
    });
    const res = await app.inject({ method: "GET", url: "/api/providers/selection" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      chat: { provider: "openai", modelId: chatId },
      embedding: { provider: "openai", modelId: embedId },
    });
    await app.close();
  });
});

describe("providers routes wired in buildServer (Ticket 04, composition root)", () => {
  it("saves a key to SQLite and discovers models with vault plaintext", async () => {
    const dbInstance = createSqliteDatabase({ dbPath: ":memory:" });
    try {
      initializeSqliteSchema(dbInstance.sqlite);
      const userId = "11111111-1111-4111-8111-111111111111";
      const now = new Date().toISOString();
      dbInstance.sqlite.exec(`
        INSERT INTO users (id, email, display_name, role, created_at, updated_at)
        VALUES ('${userId}', 'owner@notebench.local', 'Owner', 'owner', '${now}', '${now}');
      `);
      const vault = new EncryptedVault(
        randomBytes(32),
        new SqliteVaultStorage(new SqliteVaultKeyRepository(dbInstance.db, dbInstance.sqlite))
      );
      const selections = new SqliteModelSelectionRepository(dbInstance.db, dbInstance.sqlite);
      const adapter = new ScriptedAdapter(() => ({ ok: true, latencyMs: 7 }), [
        { id: "wired-model" },
      ]);
      const app = await buildServer({
        logger: false,
        db: dbInstance,
        defaultUserId: userId,
        vault,
        modelSelections: selections,
        providerAdapters: { openai: adapter },
      });
      await app.ready();
      try {
        const key = randomKey();
        const saved = await app.inject({
          method: "POST",
          url: "/api/providers/openai/key",
          payload: { apiKey: key },
        });
        expect(saved.statusCode).toBe(200);
        expect(saved.body).not.toContain(key);

        const listed = await app.inject({
          method: "GET",
          url: "/api/providers/openai/models?keyId=default",
        });
        expect(listed.statusCode).toBe(200);
        expect(listed.json()).toEqual({ models: [{ id: "wired-model" }] });
        expect(listed.body).not.toContain(key);
        expect(adapter.calls.at(-1)?.apiKey).toBe(key);
      } finally {
        await app.close();
      }
    } finally {
      dbInstance.close();
    }
  });
});
