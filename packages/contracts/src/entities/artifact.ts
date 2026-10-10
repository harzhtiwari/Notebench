import { z } from "zod";

export const ArtifactTypeSchema = z.enum([
  "report",
  "study_guide",
  "faq",
  "flashcards",
  "quiz",
  "timeline",
  "deck",
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  notebookId: z.string().uuid(),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  schemaVersion: z.number().int().positive().default(1),
  currentVersionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const CreateArtifactInputSchema = z.object({
  notebookId: z.string().uuid(),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
});
export type CreateArtifactInput = z.infer<typeof CreateArtifactInputSchema>;
