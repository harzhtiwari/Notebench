import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { type EncryptedVault, scrubSecretFromText } from "@notebench/infra-vault";
import {
  getAdapter,
  ProviderError,
  providerRegistry,
  type ProviderAdapter,
  type ProviderFailureCategory,
  type ProviderId,
} from "@notebench/infra-llm";
import type { NotebookErrorCode } from "@notebench/contracts";

const DEFAULT_KEY_ID = "default";

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(providerRegistry, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

/**
Persistence port for chat/embedding selections (Ticket 04 D6).
*/
export interface ModelSelectionStore {
  save(selection: {
    userId: string;
    kind: "chat" | "embedding";
    provider: string;
    modelId: string;
  }): Promise<unknown>;
  get(
    userId: string,
    kind: "chat" | "embedding"
  ): Promise<{ provider: string; modelId: string } | null>;
}

export interface ProvidersRouteOptions {
  adapters?: Partial<Record<ProviderId, ProviderAdapter>> | undefined;
  vault: EncryptedVault;
  selections: ModelSelectionStore;
  defaultUserId?: string | undefined;
  resolveOwnerId?: (() => Promise<string | null>) | undefined;
}

const FAILURE_WIRE: Readonly<Record<ProviderFailureCategory, { status: number; code: NotebookErrorCode }>> = {
  unauthorized: { status: 401, code: "UNAUTHORIZED" },
  forbidden: { status: 403, code: "PROVIDER_ERROR" },
  not_found: { status: 404, code: "NOT_FOUND" },
  rate_limited: { status: 429, code: "RATE_LIMITED" },
  bad_request: { status: 400, code: "VALIDATION_ERROR" },
  timeout: { status: 504, code: "PROVIDER_ERROR" },
  redirect_refused: { status: 502, code: "PROVIDER_ERROR" },
  server_error: { status: 502, code: "PROVIDER_ERROR" },
  network_error: { status: 502, code: "PROVIDER_ERROR" },
};

function failureStatus(category: ProviderFailureCategory): number {
  return FAILURE_WIRE[category].status;
}

function failureCode(category: ProviderFailureCategory): NotebookErrorCode {
  return FAILURE_WIRE[category].code;
}

/**
Rejects non-http(s) base URLs before any outbound call.
*/
function resolveBaseUrl(
  adapter: ProviderAdapter,
  override: string | undefined
): { baseUrl: string } | { error: string } {
  const baseUrl = override ?? adapter.defaultBaseUrl;
  if (baseUrl.length === 0) {
    return { error: "A baseUrl is required for this provider." };
  }
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    return { error: "baseUrl must be a valid absolute URL." };
  }
  return protocol !== "http:" && protocol !== "https:" ? { error: "baseUrl must use http or https." } : { baseUrl };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
Fastify route plugin for provider key test, model discovery, key storage
and model selection (Ticket 04). Provider calls never come from the
browser — the daemon holds every key. Failure messages are scrubbed with
the presented key before responding; full keys never leave the vault.
*/
export const providersRoutes: FastifyPluginAsync<ProvidersRouteOptions> = (app, options) => {
  const { vault, selections } = options;
  const explicitDefaultUserId = options.defaultUserId;

  const resolveUserId = async (headerVal: unknown): Promise<string | null> => {
    if (typeof headerVal === "string" && headerVal.trim().length > 0) {
      return headerVal.trim();
    }
    if (explicitDefaultUserId) {
      return explicitDefaultUserId;
    }
    return options.resolveOwnerId ? options.resolveOwnerId() : null;
  };

  const requireUserId = async (request: FastifyRequest, reply: FastifyReply): Promise<string | null> => {
    const userId = await resolveUserId(request.headers["x-user-id"]);
    if (!userId) {
      await reply.status(409).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "Setup required: create owner first.",
        },
      });
      return null;
    }
    return userId;
  };

  const resolveAdapter = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params;
    const provider = isRecord(params) ? params["provider"] : undefined;
    const adapter = isProviderId(provider)
      ? (options.adapters?.[provider] ?? getAdapter(provider))
      : undefined;
    if (adapter === undefined) {
      await reply.status(404).send({
        error: {
          code: "NOT_FOUND" satisfies NotebookErrorCode,
          message: `Unknown provider: ${typeof provider === "string" ? provider : "?"}`,
        },
      });
      return null;
    }
    return adapter;
  };

  app.post("/api/providers/:provider/test", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const adapter = await resolveAdapter(request, reply);
    if (!adapter) {
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const apiKey = optionalString(body, "apiKey") ?? "";
    if (apiKey.length === 0 && !adapter.isLocal) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "apiKey is required to test a provider key.",
        },
      });
    }
    const resolved = resolveBaseUrl(adapter, optionalString(body, "baseUrl"));
    if ("error" in resolved) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: resolved.error,
        },
      });
    }
    const result = await adapter.testKey({ baseUrl: resolved.baseUrl, apiKey });
    if (result.ok) {
      return reply.status(200).send({ ok: true, latencyMs: result.latencyMs });
    }
    return reply.status(failureStatus(result.category)).send({
      error: {
        code: failureCode(result.category),
        message: scrubSecretFromText(result.message, [apiKey]),
        details: { category: result.category },
      },
    });
  });

  app.get("/api/providers/:provider/models", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const adapter = await resolveAdapter(request, reply);
    if (!adapter) {
      return;
    }
    const query = isRecord(request.query) ? request.query : {};
    const keyId = optionalString(query, "keyId");
    const headerKey = headerValue(request.headers["x-provider-key"]);
    const headerBaseUrl = headerValue(request.headers["x-provider-base-url"]);

    if (keyId !== undefined) {
      const secret = await vault.getKey(adapter.id, keyId, userId);
      if (!secret) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND" satisfies NotebookErrorCode,
            message: "No saved key for this provider.",
          },
        });
      }
      try {
        const models = await secret.withSecretAsync(async (apiKey) => {
          const resolved = resolveBaseUrl(adapter, headerBaseUrl);
          if ("error" in resolved) {
            throw new ProviderError("bad_request", resolved.error);
          }
          try {
            return await adapter.listModels({ baseUrl: resolved.baseUrl, apiKey });
          } catch (error: unknown) {
            if (error instanceof ProviderError) {
              throw new ProviderError(
                error.category,
                scrubSecretFromText(error.message, [apiKey]),
                error.status
              );
            }
            throw error;
          }
        });
        return await reply.status(200).send({ models });
      } catch (error: unknown) {
        if (error instanceof ProviderError) {
          return reply.status(failureStatus(error.category)).send({
            error: {
              code: failureCode(error.category),
              message: error.message,
              details: { category: error.category },
            },
          });
        }
        throw error;
      }
    }

    if (!headerKey || headerKey.length === 0) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "Provide an x-provider-key header or a saved keyId.",
        },
      });
    }
    const resolved = resolveBaseUrl(adapter, headerBaseUrl);
    if ("error" in resolved) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: resolved.error,
        },
      });
    }
    try {
      const models = await adapter.listModels({ baseUrl: resolved.baseUrl, apiKey: headerKey });
      return await reply.status(200).send({ models });
    } catch (error: unknown) {
      if (error instanceof ProviderError) {
        return reply.status(failureStatus(error.category)).send({
          error: {
            code: failureCode(error.category),
            message: scrubSecretFromText(error.message, [headerKey]),
            details: { category: error.category },
          },
        });
      }
      throw error;
    }
  });

  app.post("/api/providers/:provider/key", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const adapter = await resolveAdapter(request, reply);
    if (!adapter) {
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const apiKey = optionalString(body, "apiKey");
    if (!apiKey || apiKey.length === 0) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "apiKey is required to save a provider key.",
        },
      });
    }
    const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
    const { maskedKey } = await vault.setKey(adapter.id, keyId, apiKey, userId);
    return reply.status(200).send({ provider: adapter.id, keyId, maskedKey });
  });

  app.put("/api/providers/selection", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const kind = optionalString(body, "kind");
    const provider = optionalString(body, "provider");
    const modelId = optionalString(body, "modelId");
    if (!provider || !modelId || (kind !== "chat" && kind !== "embedding")) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "kind (chat|embedding), provider and modelId are required.",
        },
      });
    }
    if (!isProviderId(provider)) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: `Unknown provider: ${provider}`,
        },
      });
    }
    await selections.save({ userId, kind, provider, modelId });
    return reply.status(200).send({ kind, provider, modelId });
  });

  app.get("/api/providers/selection", async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const chat = await selections.get(userId, "chat");
    const embedding = await selections.get(userId, "embedding");
    return reply.status(200).send({
      chat: chat ? { provider: chat.provider, modelId: chat.modelId } : null,
      embedding: embedding ? { provider: embedding.provider, modelId: embedding.modelId } : null,
    });
  });

  return Promise.resolve();
};
