import type { DeletionLevel } from "@notebench/contracts";

export type DeletionRisk = "low" | "medium" | "high";
export type DeletionConfirmType = "click" | "phrase" | "reauth";

export interface DeletionLevelDefinition {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id: DeletionLevel;
  name: string;
  description: string;
  risk: DeletionRisk;
  confirm: DeletionConfirmType;
  reauth: boolean;
  phrase?: string | undefined;
  owners: readonly string[];
  effects: readonly string[];
  disclosures?: readonly string[] | undefined;
}

export const DELETION_LEVELS: readonly DeletionLevelDefinition[] = [
  {
    level: 1,
    id: "cache",
    name: "Clear Cache",
    description: "Purge temporary cache and application logs while preserving all persistent data.",
    risk: "low",
    confirm: "click",
    reauth: false,
    owners: ["cache", "runs-logs"],
    effects: [
      "Purges .tmp/cache/*",
      "Purges .tmp/logs/*",
      "Preserves all .notebook/ persistent data",
    ],
  },
  {
    level: 2,
    id: "memory",
    name: "Clear Memory",
    description: "Purge conversational history, execution traces, and memory rules.",
    risk: "medium",
    confirm: "phrase",
    reauth: false,
    owners: ["chat", "memory-rules", "runs-logs"],
    effects: [
      "Purges chat messages and chat threads",
      "Purges agent run logs and trajectories in .notebook/runs/",
      "Purges memory rules and summary briefs",
      "Preserves sources, vector embeddings, artifacts, and vault keys",
    ],
  },
  {
    level: 3,
    id: "notebook",
    name: "Delete Notebook",
    description: "Permanently delete this notebook and all associated sources, embeddings, and artifacts.",
    risk: "medium",
    confirm: "phrase",
    reauth: true,
    owners: ["jobs-queue", "vectors", "chat", "artifacts", "sources", "notebooks"],
    effects: [
      "Permanently deletes notebook record and chat history",
      "Deletes all sources and document chunks",
      "Purges vector embeddings from vector store",
      "Deletes physical upload and artifact files",
      "Cancels active background jobs for this notebook",
    ],
  },
  {
    level: 4,
    id: "all_notebooks",
    name: "Delete All Notebooks",
    description: "Permanently delete all notebooks, sources, and cached data across the entire workspace.",
    risk: "medium",
    confirm: "phrase",
    reauth: true,
    phrase: "DELETE",
    owners: [
      "jobs-queue",
      "vectors",
      "chat",
      "memory-rules",
      "artifacts",
      "sources",
      "notebooks",
      "runs-logs",
      "cache",
    ],
    effects: [
      "Executes full deletion across all notebooks",
      "Purges all vector embeddings, sources, and artifacts",
      "Purges all chat history, memory rules, and run logs",
      "Clears temporary cache and logs",
      "Preserves encrypted vault keys and user settings",
    ],
  },
  {
    level: 5,
    id: "keys",
    name: "Delete API Keys",
    description: "Wipe all configured LLM provider keys and encryption secrets from the vault.",
    risk: "high",
    confirm: "phrase",
    reauth: true,
    phrase: "DELETE",
    owners: ["vault"],
    effects: [
      "Purges encrypted keys file (.notebook/vault/keys.enc)",
      "Purges master key (.notebook/vault/master.key)",
      "Purges provider key database records",
      "Zeroes in-memory client credential buffers",
      "Preserves notebooks, sources, and user account",
    ],
  },
  {
    level: 6,
    id: "everything",
    name: "Factory Reset",
    description: "Completely wipe all data, vault keys, sessions, and configuration back to initial setup.",
    risk: "high",
    confirm: "phrase",
    reauth: true,
    phrase: "DELETE",
    owners: [
      "jobs-queue",
      "vectors",
      "chat",
      "memory-rules",
      "artifacts",
      "sources",
      "notebooks",
      "runs-logs",
      "cache",
      "vault",
      "accounts",
    ],
    effects: [
      "Permanently deletes all notebooks, sources, embeddings, and artifacts",
      "Wipes all vault API keys and cryptographic secrets",
      "Wipes user account, sessions, and settings",
      "Purges .notebook/ and .tmp/ directories",
      "Clears client-side browser storage and redirects to setup",
    ],
    disclosures: [
      "Local Backups: Backups created via scripts/backup.sh or manual disk copies are untouched and must be deleted manually by the host administrator.",
      "Cloud LLM Providers: Prompts and snippets previously transmitted to third-party cloud providers via user API keys are governed by those providers' retention policies.",
    ],
  },
] as const;

const levelsById = {} as Record<DeletionLevel, DeletionLevelDefinition>;
const levelsByNumber = {} as Record<number, DeletionLevelDefinition>;

for (const def of DELETION_LEVELS) {
  levelsById[def.id] = def;
  levelsByNumber[def.level] = def;
}

export const DELETION_LEVELS_BY_ID: Record<DeletionLevel, DeletionLevelDefinition> = levelsById;
export const DELETION_LEVELS_BY_NUMBER: Record<number, DeletionLevelDefinition> = levelsByNumber;

export function getDeletionLevel(
  level: number | DeletionLevel | DeletionLevelDefinition
): DeletionLevelDefinition {
  if (typeof level === "object" && level !== null && "level" in level) {
    return level;
  }
  if (typeof level === "number") {
    const found = DELETION_LEVELS_BY_NUMBER[level];
    if (!found) {
      throw new Error(`Invalid deletion level number: ${level}`);
    }
    return found;
  }
  const found = DELETION_LEVELS_BY_ID[level];
  if (!found) {
    throw new Error(`Invalid deletion level id: ${String(level)}`);
  }
  return found;
}
