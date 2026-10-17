import { randomUUID } from "node:crypto";
import type {
  ArtifactVersion,
  ArtifactVersionRepositoryPort,
  CreateArtifactVersionParams,
} from "@notebench/contracts";

/**
 * In-Memory append-only repository for Artifact Versions DAG.
 * Adheres strictly to append-only invariants: records cannot be mutated or deleted.
 */
export class InMemoryArtifactVersionRepository
  implements ArtifactVersionRepositoryPort
{
  private readonly versions = new Map<string, ArtifactVersion>();
  private readonly artifactIndex = new Map<string, string[]>();

  public async createVersion(
    params: CreateArtifactVersionParams
  ): Promise<ArtifactVersion> {
    const id = params.id ?? randomUUID();
    const existing = this.versions.get(id);
    if (existing) {
      throw new Error(`Version with id '${id}' already exists (append-only invariant violated)`);
    }

    const version: ArtifactVersion = {
      id,
      artifactId: params.artifactId,
      number: params.number ?? 1,
      createdBy: params.createdBy,
      ...(params.model ? { model: params.model } : {}),
      ...(params.instruction ? { instruction: params.instruction } : {}),
      ...(params.parentVersionId ? { parentVersionId: params.parentVersionId } : {}),
      content: params.content,
      ...(params.contentDigest ? { contentDigest: params.contentDigest } : {}),
      createdAt: params.createdAt ?? new Date().toISOString(),
    };

    this.versions.set(id, structuredClone(version));

    const list = this.artifactIndex.get(params.artifactId) ?? [];
    list.push(id);
    this.artifactIndex.set(params.artifactId, list);

    return structuredClone(version);
  }

  public async getVersionById(
    versionId: string
  ): Promise<ArtifactVersion | null> {
    const version = this.versions.get(versionId);
    return version ? structuredClone(version) : null;
  }

  public async listVersions(
    artifactId: string
  ): Promise<ArtifactVersion[]> {
    const ids = this.artifactIndex.get(artifactId) ?? [];
    const result: ArtifactVersion[] = [];
    for (const id of ids) {
      const v = this.versions.get(id);
      if (v) {
        result.push(structuredClone(v));
      }
    }
    return result.sort((a, b) => a.number - b.number);
  }

  public async getLatestVersion(
    artifactId: string
  ): Promise<ArtifactVersion | null> {
    const list = await this.listVersions(artifactId);
    if (list.length === 0) {
      return null;
    }
    const last = list[list.length - 1];
    return last ? structuredClone(last) : null;
  }
}
