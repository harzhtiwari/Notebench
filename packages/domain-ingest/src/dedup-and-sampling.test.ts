import { describe, expect, it, vi } from "vitest";
import type { Source } from "@notebook/contracts";
import { SourceSummarySchema } from "@notebook/contracts";
import {
  DeduplicationService,
  SourceNormalizer,
  SourceSummarizer,
  StratifiedSamplingService,
} from "./dedup-and-sampling.js";

describe("Deduplication & Stratified Sampling (Seam 4 - RED phase)", () => {
  describe("DeduplicationService", () => {
    it("computes canonical 64-character hex hash", () => {
      const service = new DeduplicationService();
      const hash = service.computeHash("Notebench Research Environment");

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("normalizes CRLF to LF so line-ending variations yield identical hash", () => {
      const service = new DeduplicationService();
      const hashLf = service.computeHash("Line 1\nLine 2\nLine 3");
      const hashCrlf = service.computeHash("Line 1\r\nLine 2\r\nLine 3");

      expect(hashLf).toBe(hashCrlf);
    });

    it("normalizes Unicode to NFC so canonical decompositions match", () => {
      const service = new DeduplicationService();
      // "é" in precomposed NFC vs decomposed NFD ("e" + combining acute accent)
      const nfc = "Caf\u00E9";
      const nfd = "Cafe\u0301";

      const hashNfc = service.computeHash(nfc);
      const hashNfd = service.computeHash(nfd);

      expect(hashNfc).toBe(hashNfd);
    });

    it("returns different hashes for different content", () => {
      const service = new DeduplicationService();
      const h1 = service.computeHash("Document Alpha");
      const h2 = service.computeHash("Document Beta");

      expect(h1).not.toBe(h2);
    });

    it("computes binary hash directly on Buffer without UTF-8 corruption", () => {
      const service = new DeduplicationService();
      // Binary sequence that would be corrupted by naive .toString("utf-8")
      const binaryData = Buffer.from([0xff, 0xfe, 0x80, 0x90, 0xc0, 0xaf]);
      const hash1 = service.computeHash(binaryData);
      const hash2 = service.computeHash(binaryData);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("unifies normalizeForHashing with SourceNormalizer.normalizeText", () => {
      const text = "   Section Title   \r\nLine with trailing space    \r\n\n\n";
      const service = new DeduplicationService();
      const h1 = service.computeHash(text);
      const normalized = SourceNormalizer.normalizeText(text).canonicalContent;
      const h2 = service.computeHash(normalized);

      expect(h1).toBe(h2);
    });

    it("computes async hash with hash-wasm blake3 stream support", async () => {
      const service = new DeduplicationService();
      const hash = await service.computeHashAsync("Streamable Content");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("checks notebook-scoped duplicates via SourceDeduplicationService", async () => {
      const existingSource: Source = {
        id: "12345678-1234-1234-1234-123456789abc",
        userId: "12345678-1234-1234-1234-123456789abc",
        notebookId: "12345678-1234-1234-1234-123456789def",
        title: "Existing Paper",
        type: "docx",
        contentHash: "hash-abc",
        rawFileHash: "raw-xyz",
        status: "ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockRepo = {
        findByContentHash: vi.fn().mockImplementation(async (nbId: string, hash: string) => {
          if (nbId === "12345678-1234-1234-1234-123456789def" && hash === "hash-abc") return existingSource;
          return null;
        }),
        findByRawFileHash: vi.fn().mockImplementation(async (nbId: string, hash: string) => {
          if (nbId === "12345678-1234-1234-1234-123456789def" && hash === "raw-xyz") return existingSource;
          return null;
        }),
      };

      const { SourceDeduplicationService } = await import("./dedup-and-sampling.js");
      const dedup = new SourceDeduplicationService(mockRepo);

      const res1 = await dedup.checkDuplicate("12345678-1234-1234-1234-123456789def", { contentHash: "hash-abc" });
      expect(res1.isDuplicate).toBe(true);
      expect(res1.matchType).toBe("exact_content");
      expect(res1.existingSource?.title).toBe("Existing Paper");

      const res2 = await dedup.checkDuplicate("12345678-1234-1234-1234-123456789def", { rawFileHash: "raw-xyz" });
      expect(res2.isDuplicate).toBe(true);
      expect(res2.matchType).toBe("exact_raw_file");

      const res3 = await dedup.checkDuplicate("00000000-0000-0000-0000-000000000000", { contentHash: "hash-abc" });
      expect(res3.isDuplicate).toBe(false);
    });
  });

  describe("SourceNormalizer", () => {
    it("normalizes URLs by stripping tracking params, fragments, and sorting query keys", () => {
      const dirtyUrl1 = "https://EXAMPLE.COM:443/article?utm_source=twitter&b=2&a=1&fbclid=xyz#section";
      const dirtyUrl2 = "https://example.com/article?a=1&b=2&ref=newsletter";

      const normalized1 = SourceNormalizer.normalizeUrl(dirtyUrl1);
      const normalized2 = SourceNormalizer.normalizeUrl(dirtyUrl2);

      expect(normalized1).toBe("https://example.com/article?a=1&b=2");
      expect(normalized2).toBe("https://example.com/article?a=1&b=2");
    });
  });

  describe("StratifiedSamplingService", () => {
    it("returns whole text when content is smaller than token budget", () => {
      const sampler = new StratifiedSamplingService();
      const text = "Short article body with a few sentences.";
      const sample = sampler.sample(text, 1000);

      expect(sample.isTruncated).toBe(false);
      expect(sample.sampledText).toContain(text);
      expect(sample.fencedContent).toContain("<untrusted_source_content>");
    });

    it("applies 40% Lead / 20% Headings / 40% Tail stratified sampling when exceeding budget", () => {
      const sampler = new StratifiedSamplingService();

      // Create a large text with headings
      const leadText = "LEAD_START: Executive Summary and introduction paragraph. " + "A".repeat(500);
      const middleText = "\n\n# Section 1: Methodology\n\nSome middle text. " + "B".repeat(1000);
      const middleHeading = "\n\n## Section 2: Results\n\nMiddle findings. " + "C".repeat(1000);
      const tailText = "\n\n# Section 3: Conclusion\n\nTAIL_END: Final recommendations and conclusive remarks.";
      const fullText = leadText + middleText + middleHeading + tailText;

      // Small budget to force sampling
      const sample = sampler.sample(fullText, 200); // 200 tokens ≈ 800 chars

      expect(sample.isTruncated).toBe(true);
      expect(sample.sampledText).toContain("LEAD_START");
      expect(sample.sampledText).toContain("TAIL_END");
      expect(sample.fencedContent).toContain("<untrusted_source_content>");
      expect(sample.fencedContent).toContain("</untrusted_source_content>");
    });
  });

  describe("SourceSummarizer", () => {
    it("constructs isolated untrusted prompt and validates summary output with SourceSummarySchema", () => {
      const summarizer = new SourceSummarizer();
      const prompt = summarizer.buildPrompt("Sampled document content about distributed consensus.");

      expect(prompt).toContain("<untrusted_source_content>");
      expect(prompt).toContain("Sampled document content about distributed consensus.");
      expect(prompt).toContain("</untrusted_source_content>");
      expect(prompt).toContain("EXACTLY two sentences");

      const validSummary = {
        summary: "Distributed consensus algorithms ensure data consistency across multiple nodes. Paxos and Raft provide formal safety guarantees despite intermittent network partitions.",
        suggestedQuestions: [
          "How does Raft handle leader election during network splits?",
          "What are the latency tradeoffs between Paxos and Raft?",
          "How is log compaction implemented in distributed state machines?",
        ],
      };

      const parsed = SourceSummarySchema.parse(validSummary);
      expect(parsed.summary).toBe(validSummary.summary);
      expect(parsed.suggestedQuestions.length).toBe(3);
    });
  });
});
