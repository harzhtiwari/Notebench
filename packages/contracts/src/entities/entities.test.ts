import { describe, it, expect } from "vitest";
import {
  NotebookSchema,
  SourceSchema,
  ArtifactSchema,
  BlockSchema,
  CitationSchema,
  CitationRefSchema,
  VersionSchema,
  ArtifactVersionSchema,
  UserSchema,
  SessionSchema,
  DeletionJobSchema,
} from "./index.js";

describe("Core Entity Schemas (@notebook/contracts)", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const notebookId = "22222222-2222-4222-8222-222222222222";
  const sourceId = "33333333-3333-4333-8333-333333333333";
  const chunkId = "44444444-4444-4444-8444-444444444444";
  const artifactId = "55555555-5555-4555-8555-555555555555";
  const versionId = "66666666-6666-4666-8666-666666666666";
  const blockId = "77777777-7777-4777-8777-777777777777";
  const sessionId = "88888888-8888-4888-8888-888888888888";
  const jobId = "99999999-9999-4999-8999-999999999999";
  const now = new Date().toISOString();

  describe("NotebookSchema", () => {
    it("parses valid notebook and supports optional/nullable trashedAt for soft trash", () => {
      const valid = {
        id: notebookId,
        userId,
        title: "Deep Learning Research",
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const parsed = NotebookSchema.parse(valid);
      expect(parsed.title).toBe("Deep Learning Research");
      expect(parsed.trashedAt).toBeNull();
    });

    it("rejects invalid UUIDs or empty title", () => {
      expect(() =>
        NotebookSchema.parse({
          id: "invalid-id",
          userId,
          title: "",
          createdAt: now,
          updatedAt: now,
        })
      ).toThrow();
    });
  });

  describe("SourceSchema", () => {
    it("parses valid source across document and web types", () => {
      const source = {
        id: sourceId,
        userId,
        notebookId,
        title: "Attention Is All You Need.pdf",
        type: "pdf" as const,
        byteSize: 2048576,
        tokenCount: 15420,
        contentHash: "a".repeat(64),
        summary: "Seminal paper introducing the Transformer architecture.",
        createdAt: now,
        updatedAt: now,
      };

      const parsed = SourceSchema.parse(source);
      expect(parsed.type).toBe("pdf");
      expect(parsed.tokenCount).toBe(15420);
    });

    it("rejects negative byteSize or tokenCount", () => {
      expect(() =>
        SourceSchema.parse({
          id: sourceId,
          userId,
          notebookId,
          title: "Doc",
          type: "docx",
          byteSize: -10,
          createdAt: now,
          updatedAt: now,
        })
      ).toThrow();
    });
  });

  describe("ArtifactSchema", () => {
    it("validates all 7 core artifact types and defaults schemaVersion to 1", () => {
      const types = [
        "report",
        "study_guide",
        "faq",
        "flashcards",
        "quiz",
        "timeline",
        "deck",
      ] as const;

      for (const t of types) {
        const parsed = ArtifactSchema.parse({
          id: artifactId,
          userId,
          notebookId,
          type: t,
          title: `Output for ${t}`,
          currentVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        });
        expect(parsed.type).toBe(t);
        expect(parsed.schemaVersion).toBe(1);
      }
    });

    it("rejects unlisted artifact types", () => {
      expect(() =>
        ArtifactSchema.parse({
          id: artifactId,
          userId,
          notebookId,
          type: "unsupported_type",
          title: "Invalid",
          currentVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        })
      ).toThrow();
    });
  });

  describe("Citation & CitationRef Schema", () => {
    it("parses citation reference with precise bounding box coordinates", () => {
      const citationRef = {
        sourceId,
        chunkId,
        snippet: "Transformers rely entirely on self-attention mechanisms.",
        locator: {
          page: 3,
          box: [0.1, 0.2, 0.8, 0.4] as [number, number, number, number],
          charStart: 120,
          charEnd: 185,
        },
      };

      const parsedRef = CitationRefSchema.parse(citationRef);
      expect(parsedRef.locator.page).toBe(3);
      expect(parsedRef.locator.box).toEqual([0.1, 0.2, 0.8, 0.4]);

      const citation = {
        id: chunkId,
        ...citationRef,
        citationIndex: 1,
      };
      const parsedCitation = CitationSchema.parse(citation);
      expect(parsedCitation.citationIndex).toBe(1);
    });
  });

  describe("BlockSchema", () => {
    it("parses heading block with valid heading level", () => {
      const heading = {
        id: blockId,
        kind: "heading" as const,
        level: 2 as const,
        text: "Experimental Results",
      };
      const parsed = BlockSchema.parse(heading);
      expect(parsed.kind).toBe("heading");
      if (parsed.kind === "heading") {
        expect(parsed.level).toBe(2);
      }
    });

    it("parses paragraph block with citation anchors", () => {
      const paragraph = {
        id: blockId,
        kind: "paragraph" as const,
        text: "The model achieved 28.4 BLEU score on WMT 2014 English-to-German.",
        citations: [
          {
            sourceId,
            chunkId,
            locator: { page: 5 },
          },
        ],
        locked: false,
      };
      const parsed = BlockSchema.parse(paragraph);
      expect(parsed.kind).toBe("paragraph");
      if (parsed.kind === "paragraph") {
        expect(parsed.citations).toHaveLength(1);
      }
    });

    it("parses list block with hierarchical item structures", () => {
      const list = {
        id: blockId,
        kind: "list" as const,
        ordered: true,
        items: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            text: "Scaled Dot-Product Attention",
            citations: [],
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            text: "Multi-Head Attention",
            citations: [],
          },
        ],
      };
      const parsed = BlockSchema.parse(list);
      expect(parsed.kind).toBe("list");
      if (parsed.kind === "list") {
        expect(parsed.items).toHaveLength(2);
      }
    });

    it("parses math and Q&A blocks", () => {
      const math = BlockSchema.parse({
        id: blockId,
        kind: "math",
        latex: "\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V",
      });
      expect(math.kind).toBe("math");

      const qa = BlockSchema.parse({
        id: blockId,
        kind: "qa",
        question: "Why use self-attention over recurrence?",
        answer: "Self-attention reduces sequential computation and shortens signal paths.",
        citations: [],
      });
      expect(qa.kind).toBe("qa");
    });
  });

  describe("VersionSchema (ArtifactVersionSchema)", () => {
    it("parses valid version entry with parent pointer and content digest", () => {
      const version = {
        id: versionId,
        artifactId,
        number: 1,
        createdBy: "user" as const,
        content: {
          blocks: [
            {
              id: blockId,
              kind: "paragraph",
              text: "Initial draft.",
              citations: [],
            },
          ],
        },
        contentDigest: "b".repeat(64),
        createdAt: now,
      };

      const parsed = VersionSchema.parse(version);
      expect(parsed.number).toBe(1);
      expect(parsed.createdBy).toBe("user");
      expect(VersionSchema).toBe(ArtifactVersionSchema);
    });
  });

  describe("UserSchema", () => {
    it("parses owner account with optional Argon2id hash", () => {
      const user = {
        id: userId,
        email: "owner@notebench.local",
        displayName: "Research Lead",
        passcodeHash: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g",
        role: "owner" as const,
        createdAt: now,
        updatedAt: now,
      };

      const parsed = UserSchema.parse(user);
      expect(parsed.role).toBe("owner");
      expect(parsed.displayName).toBe("Research Lead");
    });
  });

  describe("SessionSchema", () => {
    it("parses session with 64-char SHA-256 token hash and expiration", () => {
      const session = {
        id: sessionId,
        userId,
        tokenHash: "c".repeat(64),
        userAgent: "Mozilla/5.0 Notebench Desktop",
        ipAddress: "127.0.0.1",
        lastActiveAt: now,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: now,
      };

      const parsed = SessionSchema.parse(session);
      expect(parsed.tokenHash).toHaveLength(64);
    });

    it("rejects non-64-character token hashes", () => {
      expect(() =>
        SessionSchema.parse({
          id: sessionId,
          userId,
          tokenHash: "invalid_short_hash",
          lastActiveAt: now,
          expiresAt: now,
          createdAt: now,
        })
      ).toThrow();
    });
  });

  describe("DeletionJobSchema", () => {
    it("parses deletion jobs across the 6 formal taxonomy levels", () => {
      const levels = [
        "cache",
        "memory",
        "notebook",
        "all_notebooks",
        "keys",
        "everything",
      ] as const;

      for (const level of levels) {
        const job = {
          id: jobId,
          userId,
          notebookId: level === "notebook" ? notebookId : undefined,
          level,
          status: "in_progress" as const,
          progress: 50,
          freedBytes: 1048576,
          deletedCounts: {
            sources: 2,
            chunks: 50,
            vectors: 50,
          },
          createdAt: now,
        };

        const parsed = DeletionJobSchema.parse(job);
        expect(parsed.level).toBe(level);
        expect(parsed.status).toBe("in_progress");
        expect(parsed.progress).toBe(50);
      }
    });

    it("rejects progress outside 0-100", () => {
      expect(() =>
        DeletionJobSchema.parse({
          id: jobId,
          userId,
          level: "cache",
          status: "pending",
          progress: 150,
          createdAt: now,
        })
      ).toThrow();
    });
  });
});
