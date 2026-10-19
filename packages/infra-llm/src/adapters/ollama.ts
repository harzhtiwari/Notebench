import { isRecord, joinUrl, providerGet, toFailedTestResult } from "../fetch-helper.js";
import {
  ProviderError,
  type ModelRef,
  type ProviderAdapter,
  type ProviderCallParams,
  type TestKeyResult,
} from "../types.js";

function parseTagsList(bodyText: string): readonly ModelRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProviderError("server_error", "Provider returned invalid JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["models"])) {
    throw new ProviderError("server_error", "Provider returned an unexpected model list shape");
  }
  const modelEntries = parsed["models"];
  const models: ModelRef[] = [];
  for (const entry of modelEntries) {
    if (isRecord(entry) && typeof entry["name"] === "string" && entry["name"].length > 0) {
      models.push({ id: entry["name"] });
    }
  }
  return models;
}

/**
Ollama adapter: `GET {baseUrl}/api/tags` for locally installed models.
Local requests carry no credentials; the call doubles as the D2
connection test (empty list = reachable, refusal = unreachable).
*/
export class OllamaAdapter implements ProviderAdapter {
  readonly id = "ollama" as const;
  readonly defaultBaseUrl = "http://localhost:11434";
  readonly isLocal = true;

  async listModels(params: ProviderCallParams): Promise<readonly ModelRef[]> {
    const { bodyText } = await providerGet(
      joinUrl(params.baseUrl, "/api/tags"),
      {},
      params.timeoutMs
    );
    return parseTagsList(bodyText);
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
