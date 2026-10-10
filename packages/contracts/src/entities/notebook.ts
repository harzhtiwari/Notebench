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
