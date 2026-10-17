import { z } from "zod";

export const VectorRecordSchema = z.object({
  chunkRowid: z.number().int().positive(),
  notebookId: z.string().uuid(),
  userId: z.string().uuid(),
  embedding: z.array(z.number()),
});
export type VectorRecord = z.infer<typeof VectorRecordSchema>;

export const VectorSearchResultSchema = z.object({
  chunkRowid: z.number().int().positive(),
  distance: z.number(),
});
export type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>;

export const FtsSearchResultSchema = z.object({
  chunkRowid: z.number().int().positive(),
  rank: z.number(),
  snippet: z.string().optional(),
});
export type FtsSearchResult = z.infer<typeof FtsSearchResultSchema>;

export const RrfScoredCandidateSchema = z.object({
  chunkRowid: z.number().int().positive(),
  rrfScore: z.number(),
  ftsRank: z.number().int().positive().optional(),
  vectorRank: z.number().int().positive().optional(),
});
export type RrfScoredCandidate = z.infer<typeof RrfScoredCandidateSchema>;

export interface VectorStorePort {
  insert(record: VectorRecord): Promise<void>;
  insertBatch(records: VectorRecord[]): Promise<void>;
  searchKnn(params: {
    queryVector: number[];
    notebookId: string;
    userId: string;
    k: number;
  }): Promise<VectorSearchResult[]>;
  deleteByNotebookId(notebookId: string): Promise<void>;
}

export interface FtsStorePort {
  search(params: {
    query: string;
    notebookId: string;
    userId: string;
    limit: number;
  }): Promise<FtsSearchResult[]>;
  deleteByNotebookId(notebookId: string): Promise<void>;
}

export interface HybridRetrievalParams {
  query: string;
  queryVector: number[];
  notebookId: string;
  userId: string;
  topK?: number | undefined;
  kConstant?: number | undefined;
}
