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
  id: z.uuid(),
  userId: z.uuid(),
  notebookId: z.uuid(),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  schemaVersion: z.literal(1).default(1),
  currentVersionId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const CreateArtifactInputSchema = z.object({
  notebookId: z.uuid(),
  type: ArtifactTypeSchema,
  title: z.string().min(1),
});
export type CreateArtifactInput = z.infer<typeof CreateArtifactInputSchema>;
