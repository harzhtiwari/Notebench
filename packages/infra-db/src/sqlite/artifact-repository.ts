import { randomUUID } from "node:crypto";
import { eq, desc, asc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  ArtifactVersion,
  ArtifactVersionRepositoryPort,
  CreateArtifactVersionParams,
} from "@notebench/contracts";
import { sqliteSchema } from "../schema/index.js";

/**
 * SQLite Drizzle adapter for the append-only Artifact Version DAG (Decisions 4.3, 4.5).
 */
export class SqliteArtifactVersionRepository
  implements ArtifactVersionRepositoryPort
{
  constructor(
    private readonly db: BetterSQLite3Database<typeof sqliteSchema>
  ) {}

  public async createVersion(
    params: CreateArtifactVersionParams
  ): Promise<ArtifactVersion> {
    const id = params.id ?? randomUUID();
    const createdAt = params.createdAt ?? new Date().toISOString();
    const contentString =
      typeof params.content === "string"
        ? params.content
        : JSON.stringify(params.content);

    await this.db.insert(sqliteSchema.artifactVersions).values({
      id,
      userId: params.userId,
      artifactId: params.artifactId,
      number: params.number ?? 1,
      createdBy: params.createdBy,
      model: params.model ?? null,
      instruction: params.instruction ?? null,
      parentVersionId: params.parentVersionId ?? null,
      content: contentString,
      contentDigest: params.contentDigest ?? null,
      createdAt,
    });

    return {
      id,
      artifactId: params.artifactId,
      number: params.number ?? 1,
      createdBy: params.createdBy,
      ...(params.model ? { model: params.model } : {}),
      ...(params.instruction ? { instruction: params.instruction } : {}),
      ...(params.parentVersionId ? { parentVersionId: params.parentVersionId } : {}),
      content: typeof params.content === "string" ? JSON.parse(params.content) : params.content,
      ...(params.contentDigest ? { contentDigest: params.contentDigest } : {}),
      createdAt,
    };
  }

  public async getVersionById(
    versionId: string
  ): Promise<ArtifactVersion | null> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.artifactVersions)
      .where(eq(sqliteSchema.artifactVersions.id, versionId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToEntity(row);
  }

  public async listVersions(
    artifactId: string
  ): Promise<ArtifactVersion[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.artifactVersions)
      .where(eq(sqliteSchema.artifactVersions.artifactId, artifactId))
      .orderBy(asc(sqliteSchema.artifactVersions.number));

    return rows.map((row) => this.mapRowToEntity(row));
  }

  public async getLatestVersion(
    artifactId: string
  ): Promise<ArtifactVersion | null> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.artifactVersions)
      .where(eq(sqliteSchema.artifactVersions.artifactId, artifactId))
      .orderBy(desc(sqliteSchema.artifactVersions.number))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToEntity(row);
  }

  private mapRowToEntity(
    row: typeof sqliteSchema.artifactVersions.$inferSelect
  ): ArtifactVersion {
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(row.content);
    } catch {
      parsedContent = row.content;
    }

    return {
      id: row.id,
      artifactId: row.artifactId,
      number: row.number,
      createdBy: row.createdBy === "ai" ? "ai" : "user",
      ...(row.model ? { model: row.model } : {}),
      ...(row.instruction ? { instruction: row.instruction } : {}),
      ...(row.parentVersionId ? { parentVersionId: row.parentVersionId } : {}),
      content: parsedContent,
      ...(row.contentDigest ? { contentDigest: row.contentDigest } : {}),
      createdAt: row.createdAt,
    };
  }
}
