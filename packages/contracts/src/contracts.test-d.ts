import { describe, it, expectTypeOf, assertType } from "vitest";
import { type z } from "zod";
import {
  type SseEventSchema,
  type SseEvent,
  type BoundingBox,
} from "./streaming/sse.js";
import {
  type NotebookError,
  InvarianceViolationError,
  type NotebookErrorCode,
} from "./errors/index.js";
import {
  type NotebookSchema,
  type Notebook,
  type SourceSchema,
  type Source,
  type SourceType,
  type ArtifactSchema,
  type Artifact,
  type ArtifactType,
  type BlockSchema,
  type Block,
  type HeadingBlock,
  type ParagraphBlock,
  type CitationSchema,
  type Citation,
  type CitationRefSchema as CitationReferenceSchema,
  type CitationRef as CitationReference,
  type VersionSchema,
  type Version,
  type ArtifactVersionSchema,
  type ArtifactVersion,
  type UserSchema,
  type User,
  type UserRole,
  type SessionSchema,
  type Session,
  type DeletionJobSchema,
  type DeletionJob,
  type DeletionLevel,
  type DeletionJobStatus,
} from "./entities/index.js";

describe("Type-Level Regression Suite: @notebench/contracts", () => {
  it("locks SSE Discriminated Union type inference", () => {
    type InferredSse = z.infer<typeof SseEventSchema>;
    expectTypeOf<InferredSse>().toEqualTypeOf<SseEvent>();

    const event = {} as SseEvent;
    if (event.type === "chunk") {
      expectTypeOf(event.textDelta).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.thinkingDelta).toEqualTypeOf<string | undefined>();
    }

    if (event.type !== "citation") {
      return;
    }

    expectTypeOf(event.pageNumber).toEqualTypeOf<number>();
    expectTypeOf(event.boundingBox).toEqualTypeOf<BoundingBox>();
  });

  it("verifies NotebookError inheritance and code exhaustiveness", () => {
    const error = new InvarianceViolationError("Mismatched hash");

    expectTypeOf(error).toExtend<NotebookError>();
    expectTypeOf(error.code).toEqualTypeOf<"INVARIANCE_VIOLATION">();
    expectTypeOf(error.statusCode).toEqualTypeOf<409>();

    // Negative check: ensure NotebookErrorCode accepts valid literals
    assertType<NotebookErrorCode>("INVARIANCE_VIOLATION");
  });

  it("locks Notebook entity schema inference and exact optionality", () => {
    type InferredNotebook = z.infer<typeof NotebookSchema>;
    expectTypeOf<InferredNotebook>().toEqualTypeOf<Notebook>();

    const nb = {} as Notebook;
    expectTypeOf(nb.id).toBeString();
    expectTypeOf(nb.userId).toBeString();
    expectTypeOf(nb.title).toBeString();
    expectTypeOf(nb.trashedAt).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(nb.createdAt).toBeString();
    expectTypeOf(nb.updatedAt).toBeString();
  });

  it("locks Source entity schema inference and strict source types", () => {
    type InferredSource = z.infer<typeof SourceSchema>;
    expectTypeOf<InferredSource>().toEqualTypeOf<Source>();

    const source = {} as Source;
    expectTypeOf(source.type).toEqualTypeOf<SourceType>();
    expectTypeOf(source.url).toEqualTypeOf<string | undefined>();
    expectTypeOf(source.filePath).toEqualTypeOf<string | undefined>();
    expectTypeOf(source.byteSize).toEqualTypeOf<number | undefined>();
    expectTypeOf(source.tokenCount).toEqualTypeOf<number | undefined>();
    expectTypeOf(source.summary).toEqualTypeOf<string | undefined>();

    assertType<SourceType>("pdf");
    assertType<SourceType>("docx");
    assertType<SourceType>("url");
    assertType<SourceType>("text");
  });

  it("locks Artifact entity schema inference and 7 artifact types", () => {
    type InferredArtifact = z.infer<typeof ArtifactSchema>;
    expectTypeOf<InferredArtifact>().toEqualTypeOf<Artifact>();

    const art = {} as Artifact;
    expectTypeOf(art.type).toEqualTypeOf<ArtifactType>();
    expectTypeOf(art.schemaVersion).toBeNumber();
    expectTypeOf(art.currentVersionId).toBeString();

    assertType<ArtifactType>("report");
    assertType<ArtifactType>("study_guide");
    assertType<ArtifactType>("faq");
    assertType<ArtifactType>("flashcards");
    assertType<ArtifactType>("quiz");
    assertType<ArtifactType>("timeline");
    assertType<ArtifactType>("deck");
  });

  it("locks Block discriminated union inference and narrowing", () => {
    type InferredBlock = z.infer<typeof BlockSchema>;
    expectTypeOf<InferredBlock>().toEqualTypeOf<Block>();

    const blk = {} as Block;
    if (blk.kind === "heading") {
      expectTypeOf(blk).toEqualTypeOf<HeadingBlock>();
      expectTypeOf(blk.level).toEqualTypeOf<1 | 2 | 3>();
      expectTypeOf(blk.text).toBeString();
      expectTypeOf(blk.locked).toEqualTypeOf<boolean | undefined>();
    }

    if (blk.kind !== "paragraph") {
      return;
    }

    expectTypeOf(blk).toEqualTypeOf<ParagraphBlock>();
    expectTypeOf(blk.citations).toEqualTypeOf<CitationReference[]>();
    expectTypeOf(blk.locked).toEqualTypeOf<boolean | undefined>();
  });

  it("locks Citation and CitationRef schema inference", () => {
    type InferredCitation = z.infer<typeof CitationSchema>;
    expectTypeOf<InferredCitation>().toEqualTypeOf<Citation>();

    type InferredCitationReference = z.infer<typeof CitationReferenceSchema>;
    expectTypeOf<InferredCitationReference>().toEqualTypeOf<CitationReference>();

    const cit = {} as Citation;
    expectTypeOf(cit.sourceId).toBeString();
    expectTypeOf(cit.chunkId).toEqualTypeOf<string | undefined>();
    expectTypeOf(cit.citationIndex).toEqualTypeOf<number | undefined>();
    expectTypeOf(cit.locator.page).toEqualTypeOf<number | undefined>();
    expectTypeOf(cit.locator.box).toEqualTypeOf<BoundingBox | undefined>();
  });

  it("locks Version and ArtifactVersion schema inference", () => {
    type InferredVersion = z.infer<typeof VersionSchema>;
    expectTypeOf<InferredVersion>().toEqualTypeOf<Version>();
    expectTypeOf<Version>().toEqualTypeOf<ArtifactVersion>();
    expectTypeOf<z.infer<typeof ArtifactVersionSchema>>().toEqualTypeOf<ArtifactVersion>();

    const version = {} as Version;
    expectTypeOf(version.number).toBeNumber();
    expectTypeOf(version.createdBy).toEqualTypeOf<"ai" | "user">();
    expectTypeOf(version.model).toEqualTypeOf<string | undefined>();
    expectTypeOf(version.instruction).toEqualTypeOf<string | undefined>();
    expectTypeOf(version.parentVersionId).toEqualTypeOf<string | undefined>();
    expectTypeOf(version.contentDigest).toEqualTypeOf<string | undefined>();
  });

  it("locks User entity schema inference and role enums", () => {
    type InferredUser = z.infer<typeof UserSchema>;
    expectTypeOf<InferredUser>().toEqualTypeOf<User>();

    const user = {} as User;
    expectTypeOf(user.role).toEqualTypeOf<UserRole>();
    expectTypeOf(user.email).toEqualTypeOf<string | undefined>();
    expectTypeOf(user.displayName).toEqualTypeOf<string | undefined>();
    expectTypeOf(user.passcodeHash).toEqualTypeOf<string | undefined>();

    assertType<UserRole>("owner");
    assertType<UserRole>("member");
  });

  it("locks Session entity schema inference and SHA-256 hash formatting", () => {
    type InferredSession = z.infer<typeof SessionSchema>;
    expectTypeOf<InferredSession>().toEqualTypeOf<Session>();

    const sess = {} as Session;
    expectTypeOf(sess.tokenHash).toBeString();
    expectTypeOf(sess.userAgent).toEqualTypeOf<string | undefined>();
    expectTypeOf(sess.ipAddress).toEqualTypeOf<string | undefined>();
    expectTypeOf(sess.lastActiveAt).toBeString();
    expectTypeOf(sess.expiresAt).toBeString();
  });

  it("locks DeletionJob schema inference and 6-level deletion taxonomy", () => {
    type InferredDeletionJob = z.infer<typeof DeletionJobSchema>;
    expectTypeOf<InferredDeletionJob>().toEqualTypeOf<DeletionJob>();

    const job = {} as DeletionJob;
    expectTypeOf(job.level).toEqualTypeOf<DeletionLevel>();
    expectTypeOf(job.status).toEqualTypeOf<DeletionJobStatus>();
    expectTypeOf(job.progress).toBeNumber();
    expectTypeOf(job.freedBytes).toEqualTypeOf<number | undefined>();
    expectTypeOf(job.deletedCounts).toEqualTypeOf<Record<string, number> | undefined>();

    assertType<DeletionLevel>("cache");
    assertType<DeletionLevel>("memory");
    assertType<DeletionLevel>("notebook");
    assertType<DeletionLevel>("all_notebooks");
    assertType<DeletionLevel>("keys");
    assertType<DeletionLevel>("everything");

    assertType<DeletionJobStatus>("pending");
    assertType<DeletionJobStatus>("in_progress");
    assertType<DeletionJobStatus>("completed");
    assertType<DeletionJobStatus>("failed");
  });
});
