/**
Shared port for LLM provider adapters (Ticket 04).

Each provider is one adapter implementing {@link ProviderAdapter}.
Adapters return structured, key-free categories — they never scrub:
secret scrubbing happens at the `apps/server` boundary with
`scrubSecretFromText` (Guard 11 bans infra-to-infra imports).
*/

/**
Providers supported in v0.1 (PRD D1).
*/
export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openai-compatible";

/**
A model reference surfaced by provider discovery (PRD D7, 1.29).
*/
export interface ModelRef {
  readonly id: string;
  readonly displayName?: string | undefined;
  /**
  Raw provider capability fields; absent data renders as "not reported by provider".
  */
  readonly capabilities?: Readonly<Record<string, unknown>> | undefined;
}

/**
Failure categories for key tests and discovery (Ticket 04 §3).
*/
export type ProviderFailureCategory =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "bad_request"
  | "server_error"
  | "timeout"
  | "redirect_refused"
  | "network_error";

/**
Parameters for a single provider call. Keys travel server-side only.
*/
export interface ProviderCallParams {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs?: number | undefined;
}

/**
Outcome of a key test ping (Decision 1.28).
*/
export type TestKeyResult =
  | { readonly ok: true; readonly latencyMs: number }
  | {
      readonly ok: false;
      readonly category: ProviderFailureCategory;
      readonly status?: number | undefined;
      readonly message: string;
    };

/**
Failure thrown by `listModels` on non-OK provider responses.
*/
export class ProviderError extends Error {
  readonly category: ProviderFailureCategory;
  readonly status?: number | undefined;

  constructor(category: ProviderFailureCategory, message: string, status?: number  ) {
    super(message);
    this.name = "ProviderError";
    this.category = category;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

/**
One adapter per provider; routes and UI iterate the registry.
*/
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly defaultBaseUrl: string;
  /**
  `true` for local providers (no cloud disclosure badge, PRD D8).
  */
  readonly isLocal: boolean;
  testKey(params: ProviderCallParams): Promise<TestKeyResult>;
  listModels(params: ProviderCallParams): Promise<readonly ModelRef[]>;
}
