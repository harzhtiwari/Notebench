import type {
  FtsSearchResult,
  VectorSearchResult,
  RrfScoredCandidate,
  FtsStorePort,
  VectorStorePort,
  HybridRetrievalParams,
} from "@notebook/contracts";

export interface RrfOptions {
  kConstant?: number | undefined;
  topK?: number | undefined;
}

/**
 * In-memory Reciprocal Rank Fusion (RRF) service.
 * Merges lexical (BM25 FTS5) and semantic (sqlite-vec) rank lists:
 * RRF(d) = sum(1 / (k + rank(d))) with k = 60.
 */
export class ReciprocalRankFusionService {
  public static fuse(
    ftsResults: FtsSearchResult[],
    vectorResults: VectorSearchResult[],
    options: RrfOptions = {}
  ): RrfScoredCandidate[] {
    const k = options.kConstant ?? 60;
    const candidates = new Map<
      number,
      {
        chunkRowid: number;
        rrfScore: number;
        ftsRank?: number;
        vectorRank?: number;
      }
    >();

    for (let i = 0; i < ftsResults.length; i++) {
      const item = ftsResults[i];
      if (!item) continue;
      const rank = i + 1; // 1-based rank
      const score = 1 / (k + rank);
      const existing = candidates.get(item.chunkRowid);
      if (existing) {
        existing.rrfScore += score;
        existing.ftsRank = rank;
      } else {
        candidates.set(item.chunkRowid, {
          chunkRowid: item.chunkRowid,
          rrfScore: score,
          ftsRank: rank,
        });
      }
    }

    for (let i = 0; i < vectorResults.length; i++) {
      const item = vectorResults[i];
      if (!item) continue;
      const rank = i + 1; // 1-based rank
      const score = 1 / (k + rank);
      const existing = candidates.get(item.chunkRowid);
      if (existing) {
        existing.rrfScore += score;
        existing.vectorRank = rank;
      } else {
        candidates.set(item.chunkRowid, {
          chunkRowid: item.chunkRowid,
          rrfScore: score,
          vectorRank: rank,
        });
      }
    }

    const sorted = Array.from(candidates.values()).sort((a, b) => {
      const scoreDiff = b.rrfScore - a.rrfScore;
      if (Math.abs(scoreDiff) > 1e-9) {
        return scoreDiff;
      }
      return a.chunkRowid - b.chunkRowid;
    });

    if (options.topK !== undefined && options.topK > 0) {
      return sorted.slice(0, options.topK);
    }

    return sorted;
  }
}

export interface HybridRetrieverDependencies {
  ftsStore: FtsStorePort;
  vectorStore: VectorStorePort;
  defaultLimit?: number | undefined;
  kConstant?: number | undefined;
}

/**
 * Domain Hybrid Retriever orchestrating FTS5 and sqlite-vec searches with RRF fusion.
 */
export class HybridRetriever {
  private readonly ftsStore: FtsStorePort;
  private readonly vectorStore: VectorStorePort;
  private readonly defaultLimit: number;
  private readonly kConstant: number;

  constructor(deps: HybridRetrieverDependencies) {
    this.ftsStore = deps.ftsStore;
    this.vectorStore = deps.vectorStore;
    this.defaultLimit = deps.defaultLimit ?? 20;
    this.kConstant = deps.kConstant ?? 60;
  }

  public async retrieve(params: HybridRetrievalParams): Promise<RrfScoredCandidate[]> {
    const limit = params.topK ?? this.defaultLimit;

    // Parallel retrieval across lexical and semantic retrieval ports
    const [ftsResults, vectorResults] = await Promise.all([
      this.ftsStore.search({
        query: params.query,
        notebookId: params.notebookId,
        userId: params.userId,
        limit,
      }),
      this.vectorStore.searchKnn({
        queryVector: params.queryVector,
        notebookId: params.notebookId,
        userId: params.userId,
        k: limit,
      }),
    ]);

    return ReciprocalRankFusionService.fuse(ftsResults, vectorResults, {
      kConstant: params.kConstant ?? this.kConstant,
      topK: limit,
    });
  }
}
