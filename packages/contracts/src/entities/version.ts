import { z } from "zod";

export const ArtifactVersionSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  number: z.number().int().positive(),
  createdBy: z.enum(["ai", "user"]),
  model: z.string().optional(),
  instruction: z.string().optional(),
  parentVersionId: z.string().uuid().optional(),
  content: z.unknown(),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  createdAt: z.string().datetime(),
});
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;

export const VersionSchema = ArtifactVersionSchema;
export type Version = ArtifactVersion;

export const CreateVersionInputSchema = z.object({
  artifactId: z.string().uuid(),
  createdBy: z.enum(["ai", "user"]),
  model: z.string().optional(),
  instruction: z.string().optional(),
  parentVersionId: z.string().uuid().optional(),
  content: z.unknown(),
});
export type CreateVersionInput = z.infer<typeof CreateVersionInputSchema>;
