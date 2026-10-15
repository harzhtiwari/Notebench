"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  FormField,
  Input,
  KeyTestButton,
  PasswordInput,
  ProviderRow,
  type KeyTestState,
} from "@notebook/ui";
import { ApiRequestError, fetchApiJson } from "../lib/api";

interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  cloud: boolean;
  needsBaseUrl: boolean;
  defaultBaseUrl: string;
}

const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Cloud models via API key.",
    cloud: true,
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.openai.com",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models via API key.",
    cloud: true,
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.anthropic.com",
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Google Gemini models via API key.",
    cloud: true,
    needsBaseUrl: false,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models on this machine.",
    cloud: false,
    needsBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
  },
  {
    id: "openai-compatible",
    name: "OpenAI-Compatible",
    description: "Any OpenAI-shaped endpoint via base URL.",
    cloud: true,
    needsBaseUrl: true,
    defaultBaseUrl: "",
  },
];

interface DiscoveredModel {
  id: string;
  displayName?: string;
  capabilities?: Record<string, unknown>;
}

interface SelectionState {
  chat: { provider: string; modelId: string } | null;
  embedding: { provider: string; modelId: string } | null;
}

function ProviderCard({
  meta,
  onSelectionSaved,
}: {
  meta: ProviderMeta;
  onSelectionSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(meta.defaultBaseUrl);
  const [testState, setTestState] = useState<KeyTestState>("idle");
  const [testMessage, setTestMessage] = useState<string | undefined>(undefined);
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [models, setModels] = useState<readonly DiscoveredModel[]>([]);
  const [chosenModel, setChosenModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const effectiveModel = customModel.trim() === "" ? chosenModel : customModel.trim();
  const chosenCapabilities = models.find((model) => model.id === chosenModel)?.capabilities;
  const capabilitySummary =
    chosenCapabilities === undefined || Object.keys(chosenCapabilities).length === 0
      ? "not reported by provider"
      : Object.keys(chosenCapabilities).join(", ");
  const isLoopbackUrl = /^(http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)(\/|$)/.test(
    meta.needsBaseUrl ? baseUrl : meta.defaultBaseUrl,
  );
  const showCloudBadge = meta.cloud && (meta.needsBaseUrl ? !isLoopbackUrl : true);

  const handleTest = useCallback(async () => {
    setTestState("testing");
    setTestMessage(undefined);
    try {
      const result = await fetchApiJson<{ ok: true; latencyMs: number }>(
        `/api/providers/${meta.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            ...(meta.needsBaseUrl ? { baseUrl } : {}),
          }),
        },
      );
      setLatencyMs(result.latencyMs);
      setTestState("ok");
      const listed = await fetchApiJson<{ models: DiscoveredModel[] }>(
        `/api/providers/${meta.id}/models`,
        {
          headers: {
            "x-provider-key": apiKey,
            ...(meta.needsBaseUrl ? { "x-provider-base-url": baseUrl } : {}),
          },
        },
      );
      setModels(listed.models);
      if (listed.models.length > 0 && chosenModel === "") {
        const first = listed.models[0];
        if (first) {
          setChosenModel(first.id);
        }
      }
    } catch (err: unknown) {
      setTestState("fail");
      setTestMessage(
        err instanceof ApiRequestError ? err.message : "Key test failed.",
      );
    }
  }, [apiKey, baseUrl, chosenModel, meta.id, meta.needsBaseUrl]);

  const handleSaveKey = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const saved = await fetchApiJson<{ maskedKey: string }>(
        `/api/providers/${meta.id}/key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        },
      );
      setMaskedKey(saved.maskedKey);
      setApiKey("");
      setNotice("Key saved. The full key never leaves the vault.");
    } catch (err: unknown) {
      setNotice(
        err instanceof ApiRequestError ? err.message : "Could not save the key.",
      );
    } finally {
      setSaving(false);
    }
  }, [apiKey, meta.id]);

  const handleUseFor = useCallback(
    async (kind: "chat" | "embedding") => {
      if (effectiveModel === "") {
        return;
      }
      setSaving(true);
      setNotice(null);
      try {
        await fetchApiJson(`/api/providers/selection`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, provider: meta.id, modelId: effectiveModel }),
        });
        setNotice(
          kind === "chat"
            ? `Chat model set to ${effectiveModel}.`
            : `Embedding model set to ${effectiveModel}.`,
        );
        onSelectionSaved();
      } catch (err: unknown) {
        setNotice(
          err instanceof ApiRequestError ? err.message : "Could not save the model.",
        );
      } finally {
        setSaving(false);
      }
    },
    [effectiveModel, meta.id, onSelectionSaved],
  );

  return (
    <section aria-label={`${meta.name} provider`}>
      <ProviderRow
        name={meta.name}
        description={meta.description}
        cloud={showCloudBadge}
        providerName={meta.name}
      >
        <KeyTestButton
          state={testState}
          latencyMs={latencyMs}
          message={testMessage}
          onTest={() => {
            void handleTest();
          }}
        />
      </ProviderRow>
      <div className="mt-2 flex flex-col gap-2">
        {meta.needsBaseUrl ? (
          <FormField label="Base URL">
            <Input
              type="url"
              value={baseUrl}
              placeholder="https://your-provider.example.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </FormField>
        ) : null}
        <FormField label="API Key">
          <PasswordInput
            placeholder="Key or token..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </FormField>
        {maskedKey ? <p className="text-xs text-[var(--nb-ink-2)]">Saved key: {maskedKey}</p> : null}
        {models.length > 0 ? (
          <div>
            <FormField label="Discovered models">
              <select
                aria-label={`${meta.name} models`}
                value={chosenModel}
                onChange={(event) => setChosenModel(event.target.value)}
                className="h-9 rounded-[var(--nb-radius-input)] border border-[var(--nb-edge)] bg-[var(--nb-sheet)] px-3 text-sm text-[var(--nb-ink)]"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName ?? model.id}
                  </option>
                ))}
              </select>
            </FormField>
            <p className="text-xs text-[var(--nb-ink-2)]">Capabilities: {capabilitySummary}</p>
          </div>
        ) : null}
        <FormField label="Custom model ID (optional)">
          <Input
            placeholder="Type a model ID not in the list..."
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={saving || apiKey === ""} onClick={() => { void handleSaveKey(); }}>
            Save key
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving || effectiveModel === ""}
            onClick={() => { void handleUseFor("chat"); }}
          >
            Use for chat
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving || effectiveModel === ""}
            onClick={() => { void handleUseFor("embedding"); }}
          >
            Use for embedding
          </Button>
        </div>
        {notice ? <p className="text-xs text-[var(--nb-ink-2)]">{notice}</p> : null}
      </div>
    </section>
  );
}

/**
 * Models & Keys screen (Ticket 04, PRD D1–D8). One card per provider reusing
 * `ProviderRow` + `KeyTestButton`; keys travel to the daemon only, and the
 * full key is cleared from the UI the moment it is saved.
 */
export function ModelsKeysScreen() {
  const [selection, setSelection] = useState<SelectionState>({ chat: null, embedding: null });

  const loadSelection = useCallback(async () => {
    try {
      const current = await fetchApiJson<SelectionState>("/api/providers/selection");
      setSelection({
        chat: current.chat ?? null,
        embedding: current.embedding ?? null,
      });
    } catch {
      // Daemon unreachable: leave the defaults; per-card errors carry the detail.
    }
  }, []);

  useEffect(() => {
    void loadSelection();
  }, [loadSelection]);

  return (
    <main className="min-h-screen bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--nb-space-4)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Models & Keys</h1>
          <p className="mt-1 text-xs text-[var(--nb-ink-2)]">
            Test a key, pick from the models that key can actually use, and store
            chat and embedding models separately.
          </p>
          <p className="mt-1 text-xs text-[var(--nb-ink-2)]">
            Chat: {selection.chat ? `${selection.chat.provider} / ${selection.chat.modelId}` : "not set"}
            {" · "}
            Embedding:{" "}
            {selection.embedding
              ? `${selection.embedding.provider} / ${selection.embedding.modelId}`
              : "not set"}
          </p>
        </div>
        {PROVIDERS.map((meta) => (
          <ProviderCard key={meta.id} meta={meta} onSelectionSaved={loadSelection} />
        ))}
      </div>
    </main>
  );
}
