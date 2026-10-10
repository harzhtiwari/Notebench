import { z } from "zod";
import type {
  SettingDefinition,
  SettingsSection,
  SettingsPageId,
} from "./registry.js";

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  // Account
  {
    id: "account_profile",
    page: "account",
    title: "Profile Information",
    order: 1,
  },
  {
    id: "account_security",
    page: "account",
    title: "Authentication & Security",
    order: 2,
  },
  {
    id: "account_collab",
    page: "account",
    title: "Collaboration & Multi-User",
    order: 3,
  },
  {
    id: "account_danger",
    page: "account",
    title: "Danger Zone",
    order: 4,
  },

  // Models
  {
    id: "models_vault",
    page: "models",
    title: "API Keys Vault",
    description: "Encrypted at rest with AES-256-GCM in .notebook/vault/",
    order: 1,
  },
  {
    id: "models_local",
    page: "models",
    title: "Local Providers",
    order: 2,
  },
  {
    id: "models_selection",
    page: "models",
    title: "Default Model Selection",
    order: 3,
  },
  {
    id: "models_future",
    page: "models",
    title: "Additional Providers",
    order: 4,
  },

  // Preferences
  {
    id: "pref_appearance",
    page: "preferences",
    title: "Appearance",
    order: 1,
  },
  {
    id: "pref_grounding",
    page: "preferences",
    title: "Grounding Constraints",
    order: 2,
  },
  {
    id: "pref_export",
    page: "preferences",
    title: "Export Defaults",
    order: 3,
  },
  {
    id: "pref_locale",
    page: "preferences",
    title: "Localization",
    order: 4,
  },

  // Memory
  {
    id: "memory_overview",
    page: "memory",
    title: "Cross-Notebook Memory",
    order: 1,
  },
  {
    id: "memory_inspection",
    page: "memory",
    title: "What Notebench Remembers",
    order: 2,
  },

  // Storage
  {
    id: "storage_overview",
    page: "storage",
    title: "Storage Usage",
    order: 1,
  },
  {
    id: "storage_cascade",
    page: "storage",
    title: "Data Lifecycle & Cascading Deletion",
    order: 2,
  },
  {
    id: "storage_backends",
    page: "storage",
    title: "Storage Adapters",
    order: 3,
  },

  // Privacy
  {
    id: "privacy_posture",
    page: "privacy",
    title: "Privacy Guarantees",
    order: 1,
  },
  {
    id: "privacy_network",
    page: "privacy",
    title: "Outbound Network Activity",
    order: 2,
  },

  // Health
  {
    id: "health_doctor",
    page: "health",
    title: "System Diagnostics (/api/doctor)",
    order: 1,
  },
  {
    id: "health_daemons",
    page: "health",
    title: "Self-Healing Daemons",
    order: 2,
  },
] as const;

export const SETTINGS_REGISTRY: readonly SettingDefinition[] = [
  // ==========================================
  // PAGE 1: ACCOUNT
  // ==========================================
  {
    id: "account.name",
    page: "account",
    section: "account_profile",
    label: "Display Name",
    description: "The name associated with your owner account and session briefs.",
    control: "input",
    status: { state: "enabled" },
    defaultValue: "Local Researcher",
    valueSchema: z.string().min(1).max(100),
    inputType: "text",
  },
  {
    id: "account.passcode",
    page: "account",
    section: "account_security",
    label: "Session Passcode",
    description: "Optional argon2id hashed passcode required on server startup and session renewal.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Change Passcode",
  },
  {
    id: "account.logout",
    page: "account",
    section: "account_security",
    label: "Terminate Current Session",
    description: "Clears your local session cookie and returns to the lock screen.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Log Out",
  },
  {
    id: "account.multiUser",
    page: "account",
    section: "account_collab",
    label: "Multi-User Team Workspaces",
    description: "Enable multiple user accounts with role-based access control.",
    control: "toggle",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "Multi-user collaboration arrives in 0.3 with role-based access control.",
    },
    defaultValue: false,
    valueSchema: z.boolean(),
  },
  {
    id: "account.oauth",
    page: "account",
    section: "account_collab",
    label: "OAuth & Enterprise SSO",
    description: "Authenticate via Google, GitHub, or OpenID Connect providers.",
    control: "button",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "OAuth and enterprise SSO identity providers arrive in 0.3.",
    },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Configure SSO",
  },
  {
    id: "account.delete",
    page: "account",
    section: "account_danger",
    label: "Delete Account & All Data",
    description: "Permanently purges the owner account, sessions, vault, and all notebooks (Level 6).",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Delete Account (Level 6)",
    isDestructive: true,
    requiresPasscode: true,
  },

  // ==========================================
  // PAGE 2: MODELS & KEYS
  // ==========================================
  {
    id: "models.openaiKey",
    page: "models",
    section: "models_vault",
    label: "OpenAI API Key",
    description: "Used for GPT-4o, GPT-4o-mini, and text-embedding-3-* models.",
    control: "input",
    status: { state: "enabled" },
    defaultValue: "",
    valueSchema: z.string(),
    inputType: "password",
    placeholder: "sk-proj-...",
  },
  {
    id: "models.anthropicKey",
    page: "models",
    section: "models_vault",
    label: "Anthropic API Key",
    description: "Used for Claude 3.5 Sonnet and Claude 3.5 Haiku generations.",
    control: "input",
    status: { state: "enabled" },
    defaultValue: "",
    valueSchema: z.string(),
    inputType: "password",
    placeholder: "sk-ant-...",
  },
  {
    id: "models.googleKey",
    page: "models",
    section: "models_vault",
    label: "Google Gemini API Key",
    description: "Used for Gemini 1.5 Pro, Gemini 1.5 Flash, and text-embedding-004.",
    control: "input",
    status: { state: "enabled" },
    defaultValue: "",
    valueSchema: z.string(),
    inputType: "password",
    placeholder: "AIzaSy...",
  },
  {
    id: "models.ollamaUrl",
    page: "models",
    section: "models_local",
    label: "Ollama Server Base URL",
    description: "Local model daemon endpoint for fully offline inference.",
    control: "input",
    status: { state: "enabled" },
    defaultValue: "http://127.0.0.1:11434",
    valueSchema: z.string().url(),
    inputType: "url",
  },
  {
    id: "models.chatModel",
    page: "models",
    section: "models_selection",
    label: "Primary Chat Model",
    description: "The default generative model used for grounded conversations and briefings.",
    control: "select",
    status: { state: "enabled" },
    defaultValue: "gpt-4o",
    valueSchema: z.string().min(1),
    options: [
      { label: "OpenAI GPT-4o", value: "gpt-4o" },
      { label: "OpenAI GPT-4o mini", value: "gpt-4o-mini" },
      { label: "Anthropic Claude 3.5 Sonnet", value: "claude-3-5-sonnet-latest" },
      { label: "Google Gemini 1.5 Pro", value: "gemini-1.5-pro" },
      { label: "Local Ollama Llama 3.2", value: "ollama:llama3.2" },
    ],
  },
  {
    id: "models.embeddingModel",
    page: "models",
    section: "models_selection",
    label: "Primary Embedding Model",
    description: "The vector model used to compute chunk embeddings for sqlite-vec.",
    control: "select",
    status: { state: "enabled" },
    defaultValue: "text-embedding-3-small",
    valueSchema: z.string().min(1),
    options: [
      { label: "OpenAI text-embedding-3-small (1536d)", value: "text-embedding-3-small" },
      { label: "OpenAI text-embedding-3-large (3072d)", value: "text-embedding-3-large" },
      { label: "Google text-embedding-004 (768d)", value: "text-embedding-004" },
      { label: "Local Ollama nomic-embed-text", value: "ollama:nomic-embed-text" },
    ],
  },
  {
    id: "models.perTask",
    page: "models",
    section: "models_selection",
    label: "Per-Task Model Assignment",
    description: "Route chat, flashcards, slide generation, and summarization to distinct models.",
    control: "select",
    status: {
      state: "disabled",
      until: "0.2",
      reason: "Per-task model assignment arrives in 0.2 alongside workbench pipeline expansions.",
    },
    defaultValue: "default",
    valueSchema: z.string(),
  },
  {
    id: "models.webSearch",
    page: "models",
    section: "models_future",
    label: "Live Web Search Provider",
    description: "Connect Brave, Tavily, or SearXNG to fetch live internet references.",
    control: "select",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "Live web search integrations arrive in 0.3 under Deep Web Research.",
    },
    defaultValue: "none",
    valueSchema: z.string(),
  },
  {
    id: "models.voiceProvider",
    page: "models",
    section: "models_future",
    label: "Audio Overview Voice Synthesis",
    description: "Select ElevenLabs or local Piper TTS for multi-speaker podcast generation.",
    control: "select",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "Audio podcast generation and voice synthesis arrive in 0.3.",
    },
    defaultValue: "none",
    valueSchema: z.string(),
  },

  // ==========================================
  // PAGE 3: PREFERENCES
  // ==========================================
  {
    id: "preferences.theme",
    page: "preferences",
    section: "pref_appearance",
    label: "Interface Theme",
    description: "Visual appearance across workbench editors and navigation panels.",
    control: "select",
    status: { state: "enabled" },
    defaultValue: "system",
    valueSchema: z.enum(["light", "dark", "system"]),
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "Follow System Preference", value: "system" },
    ],
  },
  {
    id: "preferences.groundingMode",
    page: "preferences",
    section: "pref_grounding",
    label: "Knowledge Retrieval Mode",
    description: "Governs whether the assistant relies strictly on selected notebook sources.",
    control: "select",
    status: { state: "enabled" },
    defaultValue: "strict",
    valueSchema: z.enum(["strict", "deep_research"]),
    options: [
      { label: "Strict Source (Grounding C10: Only checked sources)", value: "strict" },
      {
        label: "Deep Web Research (Internet Crawl)",
        value: "deep_research",
        disabled: true,
        until: "0.3",
      },
    ],
  },
  {
    id: "preferences.defaultExport",
    page: "preferences",
    section: "pref_export",
    label: "Default Export Format",
    description: "Pre-selects format in the document export dialog.",
    control: "select",
    status: { state: "enabled" },
    defaultValue: "markdown",
    valueSchema: z.enum(["markdown", "docx", "pdf", "csv"]),
    options: [
      { label: "Markdown (.md with citations)", value: "markdown" },
      { label: "Microsoft Word (.docx)", value: "docx" },
      { label: "PDF Document (.pdf via Typst)", value: "pdf" },
      { label: "CSV Spreadsheet (.csv)", value: "csv" },
    ],
  },
  {
    id: "preferences.language",
    page: "preferences",
    section: "pref_locale",
    label: "Interface Language",
    description: "Localize UI labels, dates, and numbers.",
    control: "select",
    status: {
      state: "disabled",
      until: "later",
      reason: "Internationalization (i18n) arrives in a future milestone.",
    },
    defaultValue: "en-US",
    valueSchema: z.string(),
    options: [{ label: "English (United States)", value: "en-US" }],
  },

  // ==========================================
  // PAGE 4: MEMORY
  // ==========================================
  {
    id: "memory.enabled",
    page: "memory",
    section: "memory_overview",
    label: "Cross-Notebook Memory Engine",
    description: "Allow Notebench to remember user preferences, writing tone, and persistent facts.",
    control: "toggle",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "Cross-notebook memory engine and briefing store arrive in 0.3.",
    },
    defaultValue: false,
    valueSchema: z.boolean(),
  },
  {
    id: "memory.rulesEditor",
    page: "memory",
    section: "memory_overview",
    label: "Custom Memory Rules Editor",
    description: "Define persistent instructions that guide agent tone across all notebooks.",
    control: "custom",
    status: {
      state: "disabled",
      until: "0.3",
      reason: "Memory rules authoring arrives in 0.3 alongside domain-memory.",
    },
    defaultValue: "",
    valueSchema: z.string(),
  },
  {
    id: "memory.viewLearned",
    page: "memory",
    section: "memory_inspection",
    label: "Learned Facts Inspector",
    description: "Review what the agent currently remembers about you.",
    control: "custom",
    status: { state: "enabled" },
    defaultValue: [],
    valueSchema: z.array(z.string()),
  },

  // ==========================================
  // PAGE 5: STORAGE & DATA
  // ==========================================
  {
    id: "storage.usageBreakdown",
    page: "storage",
    section: "storage_overview",
    label: "Local Disk Space Allocation",
    description: "Storage consumption categorized across databases, uploads, vectors, and caches.",
    control: "custom",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
  },
  {
    id: "storage.clearCache",
    page: "storage",
    section: "storage_cascade",
    label: "Clear Disposable Cache (Level 1)",
    description: "Removes all ephemeral files in .tmp/cache/ and rotated debug logs.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Clear Cache",
  },
  {
    id: "storage.clearMemory",
    page: "storage",
    section: "storage_cascade",
    label: "Clear Ephemeral Run Logs (Level 2)",
    description: "Removes conversation checkpoints and in-flight execution buffers.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Clear Memory",
  },
  {
    id: "storage.exportAll",
    page: "storage",
    section: "storage_cascade",
    label: "Export All Notebooks to ZIP",
    description: "Download a complete archive of all sources, outputs, and metadata before deletion.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Export All (.zip)",
  },
  {
    id: "storage.deleteEverything",
    page: "storage",
    section: "storage_cascade",
    label: "Purge All Data (Level 6)",
    description: "Permanently wipes all databases, vectors, files, keys, and sessions.",
    control: "button",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
    buttonText: "Purge Everything (Level 6)",
    isDestructive: true,
    requiresPasscode: true,
  },
  {
    id: "storage.s3Adapter",
    page: "storage",
    section: "storage_backends",
    label: "S3-Compatible Cloud Storage",
    description: "Sync ingested documents and artifacts to AWS S3 or Cloudflare R2.",
    control: "toggle",
    status: {
      state: "disabled",
      until: "later",
      reason: "Cloud object storage adapters arrive in post-0.3 cloud release.",
    },
    defaultValue: false,
    valueSchema: z.boolean(),
  },

  // ==========================================
  // PAGE 6: PRIVACY
  // ==========================================
  {
    id: "privacy.zeroTelemetry",
    page: "privacy",
    section: "privacy_posture",
    label: "Telemetry Policy",
    description: "Notebench collects zero analytics, telemetry, or behavioral tracking.",
    control: "custom",
    status: { state: "enabled" },
    defaultValue: "Zero Outbound Telemetry",
    valueSchema: z.string(),
  },
  {
    id: "privacy.dntStatus",
    page: "privacy",
    section: "privacy_network",
    label: "Browser Privacy Signals",
    description: "Honors Global Privacy Control (GPC) and DNT headers.",
    control: "custom",
    status: { state: "enabled" },
    defaultValue: "Active",
    valueSchema: z.string(),
  },
  {
    id: "privacy.crashReports",
    page: "privacy",
    section: "privacy_posture",
    label: "Anonymized Crash Reporting",
    description: "Send scrubbed stack traces on unexpected fatal crashes.",
    control: "toggle",
    status: {
      state: "disabled",
      until: "later",
      reason: "Automated crash diagnostics opt-in deferred to post-1.0.",
    },
    defaultValue: false,
    valueSchema: z.boolean(),
  },

  // ==========================================
  // PAGE 7: HEALTH
  // ==========================================
  {
    id: "health.doctorReport",
    page: "health",
    section: "health_doctor",
    label: "Local System Diagnostics",
    description: "Real-time daemon status from /api/doctor (Node, Python, SQLite WAL, vectors).",
    control: "custom",
    status: { state: "enabled" },
    defaultValue: null,
    valueSchema: z.null(),
  },
  {
    id: "health.autoRepair",
    page: "health",
    section: "health_daemons",
    label: "Automated SQLite Integrity Self-Healing",
    description: "Detects corrupt indexes and automatically triggers VACUUM INTO repair.",
    control: "toggle",
    status: {
      state: "disabled",
      until: "later",
      reason: "Automated self-healing background daemons arrive in post-0.3.",
    },
    defaultValue: false,
    valueSchema: z.boolean(),
  },
] as const;

/**
 * Helper to query settings by page id.
 */
export function getSettingsForPage(page: SettingsPageId): SettingDefinition[] {
  return SETTINGS_REGISTRY.filter((s) => s.page === page);
}

/**
 * Helper to query sections for a specific page ordered by sequence.
 */
export function getSectionsForPage(page: SettingsPageId): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => s.page === page).slice().sort((a, b) => a.order - b.order);
}
