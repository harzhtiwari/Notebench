import { z } from "zod";

const EmbeddingMatrixSchema = z.array(z.array(z.number()));

export const EmbeddingBatchResultSchema = z.object({
  model: z.string(),
  dimensions: z.number().int().positive(),
  embeddings: EmbeddingMatrixSchema,
});
export type EmbeddingBatchResult = z.infer<typeof EmbeddingBatchResultSchema>;

export const EmbeddingQueryResultSchema = z.object({
  model: z.string(),
  dimensions: z.number().int().positive(),
  embedding: z.array(z.number()),
});
export type EmbeddingQueryResult = z.infer<typeof EmbeddingQueryResultSchema>;

/**
Port interface for calculating dense vector embeddings.
*/
export interface EmbeddingPort {
  embedBatch(
    texts: string[],
    options?: { model?: string | undefined }
  ): Promise<EmbeddingBatchResult>;
  embedQuery(
    text: string,
    options?: { model?: string | undefined }
  ): Promise<EmbeddingQueryResult>;
}
