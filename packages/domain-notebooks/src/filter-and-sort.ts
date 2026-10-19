import type { NotebookSummary } from "@notebench/contracts";
import { type DashboardSortKey, DASHBOARD_SORT_KEYS_CONFIG } from "./configs.js";

/**
Real-time filter across both Notebook Title and Ingested Source Filenames (Decision 1.35).
*/
export function filterNotebookSummaries(
  notebooks: readonly NotebookSummary[],
  query: string
): NotebookSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...notebooks];
  }

  return notebooks.filter((nb) => {
    const isTitleMatches = nb.title.toLowerCase().includes(trimmed);
    if (isTitleMatches) return true;

    const isSourceMatches = nb.sourceFileNames.some((filename) =>
      filename.toLowerCase().includes(trimmed)
    );
    return isSourceMatches;
  });
}

/**
Sorts notebook summaries by updated, created, title, or size (PRD B7).
*/
export function sortNotebookSummaries(
  notebooks: readonly NotebookSummary[],
  sortKey: DashboardSortKey = "updated",
  direction?: "asc" | "desc"
): NotebookSummary[] {
  const effectiveDirection =
    direction ??
    DASHBOARD_SORT_KEYS_CONFIG.find((s) => s.id === sortKey)?.defaultDirection ??
    "desc";

  const modifier = effectiveDirection === "asc" ? 1 : -1;

  return [...notebooks].toSorted((a, b) => {
    switch (sortKey) {
      case "updated": {
        const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return diff * modifier;
      }
      case "created": {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return diff * modifier;
      }
      case "title": {
        const diff = a.title.localeCompare(b.title);
        return diff * modifier;
      }
      case "size": {
        const diff = a.storageBytes - b.storageBytes;
        return diff * modifier;
      }
      default: {
        return 0;
      }
    }
  });
}
