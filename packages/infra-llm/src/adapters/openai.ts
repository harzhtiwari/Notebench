import { isRecord, joinUrl, providerGet, toFailedTestResult } from "../fetch-helper.js";
import {
  ProviderError,
  type ModelRef,
  type ProviderAdapter,
  type ProviderCallParams,
  type TestKeyResult,
} from "../types.js";

function parseOpenAiList(bodyText: string): readonly ModelRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProviderError("server_error", "Provider returned invalid JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["data"])) {
    throw new ProviderError("server_error", "Provider returned an unexpected model list shape");
  }
  const models: ModelRef[] = [];
  for (const entry of parsed["data"]) {
    if (isRecord(entry) && typeof entry["id"] === "string" && entry["id"].length > 0) {
      models.push({ id: entry["id"] });
    }
  }
  return models;
}

/**
 * OpenAI adapter: `GET {baseUrl}/v1/models` with `Authorization: Bearer`.
 * The list endpoint has no pagination — one page holds every model.
 */
export class OpenAiAdapter implements ProviderAdapter {
  readonly id = "openai" as const;
  readonly defaultBaseUrl = "https://api.openai.com";
  readonly isLocal = false;

  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    const timeoutMs = params.timeoutMs;
    const { bodyText } = await providerGet(
      joinUrl(params.baseUrl, "/v1/models"),
      { authorization: `Bearer ${params.apiKey}` },
      timeoutMs
    );
    return parseOpenAiList(bodyText);
  }

  async testKey(params: ProviderCallParams): Promise<TestKeyResult> {
    const started = Date.now();
    try {
      await this.listModels(params);
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
