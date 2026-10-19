import { isRecord, joinUrl, providerGet, toFailedTestResult } from "../fetch-helper.js";
import {
  ProviderError,
  type ModelRef,
  type ProviderAdapter,
  type ProviderCallParams,
  type TestKeyResult,
} from "../types.js";

function parseCompatList(bodyText: string): readonly ModelRef[] {
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
    if (isRecord(entry) && typeof entry["id"] === "string" && entry["id"].length > 0) {
      models.push({ id: entry["id"] });
    }
  }
  return models;
}

/**
OpenAI-compatible adapter: `GET {baseUrl}/v1/models` in the common
OpenAI envelope. The key header is sent only when a key is configured —
many local servers accept an empty key.
*/
export class OpenAiCompatibleAdapter implements ProviderAdapter {
  readonly id = "openai-compatible" as const;
  readonly defaultBaseUrl = "";
  readonly isLocal = false;

  private headers(apiKey: string): Record<string, string> {
    return apiKey.length === 0 ? {} : { authorization: `Bearer ${apiKey}` };
  }

  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    const { bodyText } = await providerGet(
      joinUrl(params.baseUrl, "/v1/models"),
      this.headers(params.apiKey),
      params.timeoutMs
    );
    return parseCompatList(bodyText);
  }

  async testKey(params: ProviderCallParams): Promise<TestKeyResult> {
    const started = Date.now();
    try {
      await this.listModels(params);
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
