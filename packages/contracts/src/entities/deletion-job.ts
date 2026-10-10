import { z } from "zod";

export const DeletionLevelSchema = z.enum([
  "cache",
  "memory",
  "notebook",
  "all_notebooks",
  "keys",
  "everything",
]);
export type DeletionLevel = z.infer<typeof DeletionLevelSchema>;

export const DeletionJobStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type DeletionJobStatus = z.infer<typeof DeletionJobStatusSchema>;

export const DeletionJobSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  notebookId: z.string().uuid().optional(),
  level: DeletionLevelSchema,
  status: DeletionJobStatusSchema,
  progress: z.number().min(0).max(100).default(0),
  freedBytes: z.number().int().nonnegative().optional(),
  deletedCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type DeletionJob = z.infer<typeof DeletionJobSchema>;

export const CreateDeletionJobInputSchema = z.object({
  userId: z.string().uuid(),
  notebookId: z.string().uuid().optional(),
  level: DeletionLevelSchema,
});
export type CreateDeletionJobInput = z.infer<typeof CreateDeletionJobInputSchema>;
