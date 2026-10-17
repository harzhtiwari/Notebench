import { z } from "zod";

export const NotebookSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1),
  trashedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Notebook = z.infer<typeof NotebookSchema>;

export const CreateNotebookInputSchema = z.object({
  title: z.string().min(1),
});
export type CreateNotebookInput = z.infer<typeof CreateNotebookInputSchema>;

export const UpdateNotebookInputSchema = z.object({
  title: z.string().min(1).optional(),
  trashedAt: z.string().datetime().nullable().optional(),
});
export type UpdateNotebookInput = z.infer<typeof UpdateNotebookInputSchema>;

export const NotebookSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1),
  trashedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourcesCount: z.number().int().nonnegative().default(0),
  artifactsCount: z.number().int().nonnegative().default(0),
  storageBytes: z.number().int().nonnegative().default(0),
  sourceFileNames: z.array(z.string()).default([]),
});
export type NotebookSummary = z.infer<typeof NotebookSummarySchema>;

export const DuplicateNotebookInputSchema = z.object({
  title: z.string().min(1).optional(),
  duplicateSources: z.boolean().default(true),
  duplicateArtifacts: z.boolean().default(true),
  includeChatHistory: z.boolean().default(false),
});
export type DuplicateNotebookInput = z.infer<typeof DuplicateNotebookInputSchema>;

export const DashboardMetricsSchema = z.object({
  storageUsedBytes: z.number().int().nonnegative().default(0),
  storageSafeCapBytes: z.number().int().positive().default(5 * 1024 * 1024 * 1024),
  notebookCount: z.number().int().nonnegative().default(0),
  sourceCount: z.number().int().nonnegative().default(0),
  artifactCount: z.number().int().nonnegative().default(0),
});
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

export interface NotebookRepositoryPort {
  listSummaries(userId: string): Promise<NotebookSummary[]>;
  findById(id: string, userId: string): Promise<Notebook | null>;
  create(userId: string, input: CreateNotebookInput): Promise<Notebook>;
  update(id: string, userId: string, input: UpdateNotebookInput): Promise<Notebook>;
  delete(id: string, userId: string): Promise<void>;
  duplicate(
    sourceNotebookId: string,
    userId: string,
    input?: DuplicateNotebookInput
  ): Promise<Notebook>;
  getMetrics(userId: string): Promise<DashboardMetrics>;
}

export type DashboardColumnId =
  | "emblem"
  | "title"
  | "sourcesCount"
  | "artifactsCount"
  | "storageFootprint"
  | "lastUpdated"
  | "actions";

export interface DashboardColumnConfig {
  id: DashboardColumnId;
  label: string;
  width?: string | undefined;
  sortable?: boolean | undefined;
}

export const DASHBOARD_COLUMNS_CONFIG: readonly DashboardColumnConfig[] = [
  { id: "emblem", label: "", width: "40px", sortable: false },
  { id: "title", label: "Title", sortable: true },
  { id: "sourcesCount", label: "Sources", sortable: false },
  { id: "artifactsCount", label: "Artifacts", sortable: false },
  { id: "storageFootprint", label: "Storage", sortable: true },
  { id: "lastUpdated", label: "Last Updated", sortable: true },
  { id: "actions", label: "", width: "48px", sortable: false },
] as const;

export type DashboardSortKey = "updated" | "created" | "title" | "size";

export interface DashboardSortConfig {
  id: DashboardSortKey;
  label: string;
  defaultDirection: "asc" | "desc";
}

export const DASHBOARD_SORT_KEYS_CONFIG: readonly DashboardSortConfig[] = [
  { id: "updated", label: "Last Updated", defaultDirection: "desc" },
  { id: "created", label: "Date Created", defaultDirection: "desc" },
  { id: "title", label: "Title", defaultDirection: "asc" },
  { id: "size", label: "Storage Footprint", defaultDirection: "desc" },
] as const;

export type DashboardMetricId =
  | "storageUsed"
  | "notebookCount"
  | "sourceCount"
  | "artifactCount";

export interface DashboardMetricConfig {
  id: DashboardMetricId;
  label: string;
  field: "storageUsedBytes" | "notebookCount" | "sourceCount" | "artifactCount";
}

export const DASHBOARD_METRICS_CONFIG: readonly DashboardMetricConfig[] = [
  { id: "storageUsed", label: "Storage Used", field: "storageUsedBytes" },
  { id: "notebookCount", label: "Total Notebooks", field: "notebookCount" },
  { id: "sourceCount", label: "Total Ingested Sources", field: "sourceCount" },
  { id: "artifactCount", label: "Total Living Artifacts", field: "artifactCount" },
] as const;
