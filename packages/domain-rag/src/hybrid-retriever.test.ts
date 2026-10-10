import { describe, expect, it } from "vitest";
import type {
  FtsSearchResult,
  VectorSearchResult,
  FtsStorePort,
  VectorStorePort,
} from "@notebook/contracts";
import {
  ReciprocalRankFusionService,
  HybridRetriever,
} from "./index.js";

describe("ReciprocalRankFusionService & HybridRetriever (Ticket #15 - RED phase)", () => {
  describe("ReciprocalRankFusionService", () => {
    it("merges FTS and vector rankings with k=60 reciprocal rank formula", () => {
      const ftsResults: FtsSearchResult[] = [
        { chunkRowid: 1, rank: -10.5 }, // 1st in FTS
        { chunkRowid: 2, rank: -8.2 },  // 2nd in FTS
        { chunkRowid: 3, rank: -5.0 },  // 3rd in FTS
      ];

      const vectorResults: VectorSearchResult[] = [
        { chunkRowid: 2, distance: 0.1 }, // 1st in Vector
        { chunkRowid: 4, distance: 0.2 }, // 2nd in Vector
        { chunkRowid: 1, distance: 0.3 }, // 3rd in Vector
      ];

      const fused = ReciprocalRankFusionService.fuse(ftsResults, vectorResults, { kConstant: 60 });

      // Chunk 2: FTS rank 2, Vec rank 1 => 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ≈ 0.016129 + 0.016393 ≈ 0.03252
      // Chunk 1: FTS rank 1, Vec rank 3 => 1/(60+1) + 1/(60+3) = 1/61 + 1/63 ≈ 0.016393 + 0.015873 ≈ 0.03226
      // Chunk 4: Vec rank 2 => 1/(60+2) = 1/62 ≈ 0.016129
      // Chunk 3: FTS rank 3 => 1/(60+3) = 1/63 ≈ 0.015873

      expect(fused[0]?.chunkRowid).toBe(2);
      expect(fused[0]?.ftsRank).toBe(2);
      expect(fused[0]?.vectorRank).toBe(1);

      expect(fused[1]?.chunkRowid).toBe(1);
      expect(fused[1]?.ftsRank).toBe(1);
      expect(fused[1]?.vectorRank).toBe(3);

      expect(fused[2]?.chunkRowid).toBe(4);
      expect(fused[3]?.chunkRowid).toBe(3);

      expect(fused[0]?.rrfScore).toBeGreaterThan(fused[1]?.rrfScore ?? 0);
      expect(fused[1]?.rrfScore).toBeGreaterThan(fused[2]?.rrfScore ?? 0);
    });

    it("executes RRF fusion over 50 candidates in <0.05ms (<50us benchmark)", () => {
      const fts: FtsSearchResult[] = Array.from({ length: 25 }, (_, i) => ({
        chunkRowid: i + 1,
        rank: -(25 - i),
      }));

      const vec: VectorSearchResult[] = Array.from({ length: 25 }, (_, i) => ({
        chunkRowid: i + 15, // 10 overlapping items
        distance: i * 0.02,
      }));

      // Warm JIT
      for (let i = 0; i < 100; i++) {
        ReciprocalRankFusionService.fuse(fts, vec);
      }

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        ReciprocalRankFusionService.fuse(fts, vec);
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      expect(avgMs).toBeLessThan(0.05); // Sub-0.05ms execution time assertion
    });

    it("breaks ties deterministically by chunkRowid when RRF scores are equal", () => {
      // Chunk 10 has FTS rank 1 (score 1/61)
      const fts: FtsSearchResult[] = [{ chunkRowid: 10, rank: -5.0 }];
      // Chunk 5 has Vector rank 1 (score 1/61)
      const vec: VectorSearchResult[] = [{ chunkRowid: 5, distance: 0.1 }];

      const fused = ReciprocalRankFusionService.fuse(fts, vec);

      expect(fused[0]?.rrfScore).toBe(fused[1]?.rrfScore);
      // Secondary sort on chunkRowid ascending puts 5 before 10 regardless of insertion order
      expect(fused[0]?.chunkRowid).toBe(5);
      expect(fused[1]?.chunkRowid).toBe(10);
    });
  });

  describe("HybridRetriever", () => {
    it("coordinates FtsStorePort and VectorStorePort and returns fused ranked chunks", async () => {
      const mockFtsStore: FtsStorePort = {
        search: async () => [
          { chunkRowid: 10, rank: -12.0 },
          { chunkRowid: 20, rank: -8.0 },
        ],
        deleteByNotebookId: async () => {},
      };

      const mockVectorStore: VectorStorePort = {
        insert: async () => {},
        insertBatch: async () => {},
        searchKnn: async () => [
          { chunkRowid: 20, distance: 0.05 },
          { chunkRowid: 30, distance: 0.12 },
        ],
        deleteByNotebookId: async () => {},
      };

      const retriever = new HybridRetriever({
        ftsStore: mockFtsStore,
        vectorStore: mockVectorStore,
      });

      const results = await retriever.retrieve({
        query: "distributed storage",
        queryVector: [0.1, 0.2, 0.3],
        notebookId: "nb-1",
        userId: "user-1",
        topK: 5,
      });

      expect(results).toHaveLength(3);
      // Chunk 20 is present in both FTS and vector, so it should be rank 1
      expect(results[0]?.chunkRowid).toBe(20);
      expect(results[0]?.ftsRank).toBe(2);
      expect(results[0]?.vectorRank).toBe(1);
    });
  });
});
