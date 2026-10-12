import {
  type ArtifactContent,
  type ArtifactVersion,
  type ArtifactVersionRepositoryPort,
  ArtifactContentSchema,
  NotFoundError,
} from "@notebook/contracts";
import {
  computeNodeDigest,
  applySurgicalPatch,
  verifySiblingInvariance,
  type SurgicalPatch,
} from "./invariance.js";

export interface CreateVersionCommand {
  artifactId: string;
  userId: string;
  createdBy: "ai" | "user";
  model?: string | undefined;
  instruction?: string | undefined;
  parentVersionId?: string | undefined;
  content: ArtifactContent;
}

export interface RestoreVersionOptions {
  userId?: string | undefined;
  createdBy?: ("ai" | "user") | undefined;
  instruction?: string | undefined;
  parentVersionId?: string | undefined;
}

export interface ApplySurgicalPatchCommand {
  artifactId: string;
  userId: string;
  baseVersionId: string;
  targetId: string;
  replacement: { id: string } & Record<string, unknown>;
  expectedPreHash?: string | undefined;
  expectedSiblingHashes?: Record<string, string> | undefined;
  instruction?: string | undefined;
  createdBy?: ("ai" | "user") | undefined;
  model?: string | undefined;
}

export interface ApplyProposedContentCommand {
  artifactId: string;
  userId: string;
  baseVersionId: string;
  targetId: string;
  proposedContent: ArtifactContent;
  instruction?: string | undefined;
  createdBy?: ("ai" | "user") | undefined;
  model?: string | undefined;
}

/**
 * Domain Service managing Living Artifact Version DAGs and Sibling Invariance (Decisions 4.2, 4.3, 4.6).
 * Enforces append-only immutable history and bit-for-bit sibling invariance via RFC 8785 digests.
 */
export class ArtifactVersionDagService {
  constructor(private readonly repository: ArtifactVersionRepositoryPort) {}

  /**
   * Commits a new version to the append-only history DAG.
   */
  public async createVersion(command: CreateVersionCommand): Promise<ArtifactVersion> {
    const validatedContent = ArtifactContentSchema.parse(command.content);
    const contentDigest = computeNodeDigest(validatedContent);

    const latest = await this.repository.getLatestVersion(command.artifactId);
    const nextNumber = latest ? latest.number + 1 : 1;

    return this.repository.createVersion({
      artifactId: command.artifactId,
      userId: command.userId,
      number: nextNumber,
      createdBy: command.createdBy,
      ...(command.model ? { model: command.model } : {}),
      ...(command.instruction ? { instruction: command.instruction } : {}),
      ...(command.parentVersionId ? { parentVersionId: command.parentVersionId } : {}),
      content: validatedContent,
      contentDigest,
    });
  }

  /**
   * Retrieves a single version by its unique ID.
   */
  public async getVersion(versionId: string): Promise<ArtifactVersion | null> {
    return this.repository.getVersionById(versionId);
  }

  /**
   * Lists all versions in the lineage DAG for an artifact, ordered by version number.
   */
  public async listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    return this.repository.listVersions(artifactId);
  }

  /**
   * Non-destructive restore mechanic (Decision 4.3).
   * Restores an earlier version by creating a new version cloning the target version's content.
   * Requirement: "Restore creates a new row whose parentVersionId points at the version it restores from; the old row is unchanged."
   */
  public async restoreVersion(
    artifactId: string,
    targetVersionId: string,
    options?: RestoreVersionOptions
  ): Promise<ArtifactVersion> {
    const targetVersion = await this.repository.getVersionById(targetVersionId);
    if (!targetVersion || targetVersion.artifactId !== artifactId) {
      throw new NotFoundError(
        `Target version '${targetVersionId}' does not exist for artifact '${artifactId}'`,
        { artifactId, targetVersionId }
      );
    }

    const latest = await this.repository.getLatestVersion(artifactId);
    const nextNumber = latest ? latest.number + 1 : 1;

    const parentVersionId = options?.parentVersionId ?? targetVersionId;
    const instruction =
      options?.instruction ?? `Restored from Version ${targetVersion.number}`;

    const restoredContent = structuredClone(targetVersion.content);
    const contentDigest = computeNodeDigest(restoredContent);

    return this.repository.createVersion({
      artifactId,
      userId: options?.userId ?? "system",
      number: nextNumber,
      createdBy: options?.createdBy ?? "user",
      instruction,
      parentVersionId,
      content: restoredContent,
      contentDigest,
    });
  }

  /**
   * Surgically mutates a targeted block/item while asserting cryptographic sibling invariance (Decision 4.2).
   * On ANY sibling divergence, throws InvarianceViolationError and aborts without writing to the database.
   */
  public async applySurgicalPatch(
    command: ApplySurgicalPatchCommand
  ): Promise<ArtifactVersion> {
    const baseVersion = await this.repository.getVersionById(command.baseVersionId);
    if (!baseVersion || baseVersion.artifactId !== command.artifactId) {
      throw new NotFoundError(
        `Base version '${command.baseVersionId}' not found for artifact '${command.artifactId}'`,
        { artifactId: command.artifactId, baseVersionId: command.baseVersionId }
      );
    }

    const baseContent = ArtifactContentSchema.parse(baseVersion.content);

    const patchPayload: SurgicalPatch = {
      targetId: command.targetId,
      replacement: command.replacement,
      ...(command.expectedPreHash ? { expectedPreHash: command.expectedPreHash } : {}),
      ...(command.expectedSiblingHashes
        ? { expectedSiblingHashes: command.expectedSiblingHashes }
        : {}),
    };

    // applySurgicalPatch asserts sibling invariance via RFC 8785 SHA-256 before returning
    const updatedContent = applySurgicalPatch(baseContent, patchPayload);

    const latest = await this.repository.getLatestVersion(command.artifactId);
    const nextNumber = latest ? latest.number + 1 : 1;
    const contentDigest = computeNodeDigest(updatedContent);

    return this.repository.createVersion({
      artifactId: command.artifactId,
      userId: command.userId,
      number: nextNumber,
      createdBy: command.createdBy ?? "user",
      ...(command.model ? { model: command.model } : {}),
      instruction:
        command.instruction ?? `Surgical update targeting node '${command.targetId}'`,
      parentVersionId: command.baseVersionId,
      content: updatedContent,
      contentDigest,
    });
  }

  /**
   * Verifies that a full proposed content tree maintains sibling invariance relative to base version.
   * If valid, appends a new version pointing to base version.
   */
  public async applyProposedContent(
    command: ApplyProposedContentCommand
  ): Promise<ArtifactVersion> {
    const baseVersion = await this.repository.getVersionById(command.baseVersionId);
    if (!baseVersion || baseVersion.artifactId !== command.artifactId) {
      throw new NotFoundError(
        `Base version '${command.baseVersionId}' not found for artifact '${command.artifactId}'`,
        { artifactId: command.artifactId, baseVersionId: command.baseVersionId }
      );
    }

    const baseContent = ArtifactContentSchema.parse(baseVersion.content);
    const proposedContent = ArtifactContentSchema.parse(command.proposedContent);

    // Cryptographic assertion of sibling invariance
    verifySiblingInvariance(baseContent, proposedContent, command.targetId);

    const latest = await this.repository.getLatestVersion(command.artifactId);
    const nextNumber = latest ? latest.number + 1 : 1;
    const contentDigest = computeNodeDigest(proposedContent);

    return this.repository.createVersion({
      artifactId: command.artifactId,
      userId: command.userId,
      number: nextNumber,
      createdBy: command.createdBy ?? "user",
      ...(command.model ? { model: command.model } : {}),
      instruction:
        command.instruction ?? `Proposed content update targeting node '${command.targetId}'`,
      parentVersionId: command.baseVersionId,
      content: proposedContent,
      contentDigest,
    });
  }
}
