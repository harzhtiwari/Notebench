import { isRecord, joinUrl, providerGet, toFailedTestResult } from "../fetch-helper.js";
import {
  ProviderError,
  type ModelRef,
  type ProviderAdapter,
  type ProviderCallParams,
  type TestKeyResult,
} from "../types.js";

const PAGE_SIZE = 1000;

interface GeminiPage {
  models: ModelRef[];
  nextPageToken: string | null;
}

function parseGeminiPage(bodyText: string): GeminiPage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProviderError("server_error", "Provider returned invalid JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["models"])) {
    throw new ProviderError("server_error", "Provider returned an unexpected model list shape");
  }
  const models: ModelRef[] = [];
  for (const entry of parsed["models"]) {
    if (!isRecord(entry) || typeof entry["name"] !== "string" || entry["name"].length === 0) {
      continue;
    }
    const capabilities: Record<string, unknown> = {};
    for (const field of ["supportedGenerationMethods", "inputTokenLimit", "outputTokenLimit"]) {
      if (entry[field] !== undefined) {
        capabilities[field] = entry[field];
      }
    }
    const model: { id: string; displayName?: string; capabilities?: Record<string, unknown> } = {
      id: entry["name"],
    };
    if (typeof entry["displayName"] === "string") {
      model.displayName = entry["displayName"];
    }
    if (Object.keys(capabilities).length > 0) {
      model.capabilities = capabilities;
    }
    models.push(model);
  }
  const token = parsed["nextPageToken"];
  return { models, nextPageToken: typeof token === "string" && token.length > 0 ? token : null };
}

/**
 * Gemini adapter: `GET {baseUrl}/models` with `x-goog-api-key`
 * (ticket §7: header wins until the live check settles it),
 * paging via `pageToken` while `nextPageToken` is present.
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly id = "gemini" as const;
  readonly defaultBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
  readonly isLocal = false;

  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    const models: ModelRef[] = [];
    let pageToken: string | null = null;
    for (;;) {
      const query =
        pageToken === null
          ? `?pageSize=${String(PAGE_SIZE)}`
          : `?pageSize=${String(PAGE_SIZE)}&pageToken=${encodeURIComponent(pageToken)}`;
      const { bodyText } = await providerGet(
        `${joinUrl(params.baseUrl, "/models")}${query}`,
        { "x-goog-api-key": params.apiKey },
        params.timeoutMs
      );
      const page = parseGeminiPage(bodyText);
      models.push(...page.models);
      if (page.nextPageToken === null) {
        return models;
      }
      pageToken = page.nextPageToken;
    }
  }

  async testKey(params: ProviderCallParams): Promise<TestKeyResult> {
    const started = Date.now();
    try {
      await providerGet(
        `${joinUrl(params.baseUrl, "/models")}?pageSize=1`,
        { "x-goog-api-key": params.apiKey },
        params.timeoutMs
      );
    } catch (err: unknown) {
      const failed = toFailedTestResult(err);
      if (failed) {
        return failed;
      }
      throw err;
    }
    return { ok: true, latencyMs: Date.now() - started };
  }
}
