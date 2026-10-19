import { isRecord, joinUrl, providerGet, toFailedTestResult } from "../fetch-helper.js";
import {
  ProviderError,
  type ModelRef,
  type ProviderAdapter,
  type ProviderCallParams,
  type TestKeyResult,
} from "../types.js";

const ANTHROPIC_VERSION = "2023-06-01";
const PAGE_LIMIT = 1000;

interface AnthropicPage {
  models: ModelRef[];
  hasMore: boolean;
  lastId: string | null;
}

function parseAnthropicPage(bodyText: string): AnthropicPage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProviderError("server_error", "Provider returned invalid JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["data"])) {
    throw new ProviderError("server_error", "Provider returned an unexpected model list shape");
  }
  const data = parsed["data"];
  const models: ModelRef[] = [];
  for (const entry of data) {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || entry["id"].length === 0) {
      continue;
    }
    const model: { id: string; displayName?: string; capabilities?: Record<string, unknown> } = {
      id: entry["id"],
    };
    if (typeof entry["display_name"] === "string") {
      model.displayName = entry["display_name"];
    }
    if (isRecord(entry["capabilities"])) {
      model.capabilities = entry["capabilities"];
    }
    models.push(model);
  }
  const hasMore = parsed["has_more"];
  if (typeof hasMore !== "boolean") {
    throw new ProviderError("server_error", "Provider returned an unexpected model list shape");
  }
  const lastId = parsed["last_id"];
  return {
    models,
    hasMore,
    lastId: typeof lastId === "string" ? lastId : null,
  };
}

/**
Anthropic adapter: `GET {baseUrl}/v1/models` with `x-api-key` and
`anthropic-version: 2023-06-01`, paging via `after_id` while `has_more`.
*/
export class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic" as const;
  readonly defaultBaseUrl = "https://api.anthropic.com";
  readonly isLocal = false;

  private headers(apiKey: string): Record<string, string> {
    return { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION };
  }

  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    const models: ModelRef[] = [];
    let afterId: string | undefined;
    for (;;) {
      const query =
        afterId === undefined
          ? `?limit=${String(PAGE_LIMIT)}`
          : `?limit=${String(PAGE_LIMIT)}&after_id=${encodeURIComponent(afterId)}`;
      const { bodyText } = await providerGet(
        `${joinUrl(params.baseUrl, "/v1/models")}${query}`,
        this.headers(params.apiKey),
        params.timeoutMs
      );
      const page = parseAnthropicPage(bodyText);
      models.push(...page.models);
      if (!page.hasMore || page.lastId === null) {
        return models;
      }
      afterId = page.lastId;
    }
  }

  async testKey(params: ProviderCallParams): Promise<TestKeyResult> {
    const started = Date.now();
    try {
      await providerGet(
        `${joinUrl(params.baseUrl, "/v1/models")}?limit=1`,
        this.headers(params.apiKey),
        params.timeoutMs
      );
    } catch (error: unknown) {
      const failed = toFailedTestResult(error);
      if (failed) {
        return failed;
      }
      throw error;
    }
    return { ok: true, latencyMs: Date.now() - started };
  }
}
