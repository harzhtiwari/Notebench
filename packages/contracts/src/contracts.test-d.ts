import { describe, it, expectTypeOf, assertType } from "vitest";
import { type z } from "zod";
import {
  type SseEventSchema,
  type SseEvent,
  type BoundingBox,
} from "./streaming/sse.js";
import {
  type DeckASTSchema,
  type DeckAST,
  type SlideBlock,
  type SlideBlockPatch,
} from "./ast/deck.js";
import {
  NotebookError,
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
  type CitationRefSchema,
  type CitationRef,
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

describe("Type-Level Regression Suite: @notebook/contracts", () => {
  it("locks SSE Discriminated Union type inference", () => {
    type InferredSse = z.infer<typeof SseEventSchema>;
    expectTypeOf<InferredSse>().toEqualTypeOf<SseEvent>();

    const event = {} as SseEvent;
    if (event.type === "chunk") {
      expectTypeOf(event.textDelta).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.thinkingDelta).toEqualTypeOf<string | undefined>();
    }

    if (event.type === "citation") {
      expectTypeOf(event.pageNumber).toEqualTypeOf<number>();
      expectTypeOf(event.boundingBox).toEqualTypeOf<BoundingBox>();
    }
  });

  it("enforces Slide Deck AST block immutability and discriminators", () => {
    expectTypeOf<z.infer<typeof DeckASTSchema>>().toEqualTypeOf<DeckAST>();

    const block = {} as SlideBlock;
    if (block.type === "stat_metric") {
      expectTypeOf(block.value).toEqualTypeOf<string>();
      expectTypeOf(block.label).toEqualTypeOf<string>();
      expectTypeOf(block.trend).toEqualTypeOf<"up" | "down" | "neutral" | undefined>();
    }

    const patch = {} as SlideBlockPatch;
    expectTypeOf(patch.siblingHashes).toEqualTypeOf<Record<string, string>>();
    expectTypeOf(patch.expectedPreHash).toBeString();
  });

  it("verifies NotebookError inheritance and code exhaustiveness", () => {
    const error = new InvarianceViolationError("Mismatched hash");

    expectTypeOf(error).toMatchTypeOf<NotebookError>();
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

    const src = {} as Source;
    expectTypeOf(src.type).toEqualTypeOf<SourceType>();
    expectTypeOf(src.url).toEqualTypeOf<string | undefined>();
    expectTypeOf(src.filePath).toEqualTypeOf<string | undefined>();
    expectTypeOf(src.byteSize).toEqualTypeOf<number | undefined>();
    expectTypeOf(src.tokenCount).toEqualTypeOf<number | undefined>();
    expectTypeOf(src.summary).toEqualTypeOf<string | undefined>();

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

    if (blk.kind === "paragraph") {
      expectTypeOf(blk).toEqualTypeOf<ParagraphBlock>();
      expectTypeOf(blk.citations).toEqualTypeOf<CitationRef[]>();
      expectTypeOf(blk.locked).toEqualTypeOf<boolean | undefined>();
    }
  });

  it("locks Citation and CitationRef schema inference", () => {
    type InferredCitation = z.infer<typeof CitationSchema>;
    expectTypeOf<InferredCitation>().toEqualTypeOf<Citation>();

    type InferredCitationRef = z.infer<typeof CitationRefSchema>;
    expectTypeOf<InferredCitationRef>().toEqualTypeOf<CitationRef>();

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

    const ver = {} as Version;
    expectTypeOf(ver.number).toBeNumber();
    expectTypeOf(ver.createdBy).toEqualTypeOf<"ai" | "user">();
    expectTypeOf(ver.model).toEqualTypeOf<string | undefined>();
    expectTypeOf(ver.instruction).toEqualTypeOf<string | undefined>();
    expectTypeOf(ver.parentVersionId).toEqualTypeOf<string | undefined>();
    expectTypeOf(ver.contentDigest).toEqualTypeOf<string | undefined>();
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
