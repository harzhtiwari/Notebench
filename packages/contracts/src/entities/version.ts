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

export interface CreateArtifactVersionParams {
  id?: string | undefined;
  artifactId: string;
  userId: string;
  number?: number | undefined;
  createdBy: "ai" | "user";
  model?: string | undefined;
  instruction?: string | undefined;
  parentVersionId?: string | undefined;
  content: unknown;
  contentDigest?: string | undefined;
  createdAt?: string | undefined;
}

/**
 * Storage / Repository Port for append-only Artifact Version DAG (ADR 0004, Decision 4.3).
 */
export interface ArtifactVersionRepositoryPort {
  createVersion(params: CreateArtifactVersionParams): Promise<ArtifactVersion>;
  getVersionById(versionId: string): Promise<ArtifactVersion | null>;
  listVersions(artifactId: string): Promise<ArtifactVersion[]>;
  getLatestVersion(artifactId: string): Promise<ArtifactVersion | null>;
}
