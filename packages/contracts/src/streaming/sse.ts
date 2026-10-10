import { z } from "zod";
import { NotebookErrorCodeSchema } from "../errors/codes.js";

/**
 * Normalized Bounding Box in Page Coordinates: [x0, y0, x1, y1].
 * Values are normalized to [0, 1] relative to page dimensions.
 */
export const BoundingBoxSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const StartStreamEventSchema = z.object({
  type: z.literal("start"),
  runId: z.string(),
  threadId: z.string().optional(),
  model: z.string(),
  timestamp: z.number().int(),
});
export type StartStreamEvent = z.infer<typeof StartStreamEventSchema>;

export const ChunkStreamEventSchema = z.object({
  type: z.literal("chunk"),
  textDelta: z.string().optional(),
  thinkingDelta: z.string().optional(),
});
export type ChunkStreamEvent = z.infer<typeof ChunkStreamEventSchema>;

export const ToolCallStreamEventSchema = z.object({
  type: z.literal("tool_call"),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});
export type ToolCallStreamEvent = z.infer<typeof ToolCallStreamEventSchema>;

export const ToolResultStreamEventSchema = z.object({
  type: z.literal("tool_result"),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
});
export type ToolResultStreamEvent = z.infer<typeof ToolResultStreamEventSchema>;

export const CitationStreamEventSchema = z.object({
  type: z.literal("citation"),
  citationId: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  pageNumber: z.number().int().positive(),
  boundingBox: BoundingBoxSchema,
  snippet: z.string(),
});
export type CitationStreamEvent = z.infer<typeof CitationStreamEventSchema>;

export const ArtifactPatchStreamEventSchema = z.object({
  type: z.literal("artifact_patch"),
  artifactId: z.string(),
  slideId: z.string().optional(),
  blockId: z.string(),
  expectedPreHash: z.string().regex(/^[a-f0-9]{64}$/),
  siblingHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  replacementContent: z.unknown(),
});
export type ArtifactPatchStreamEvent = z.infer<typeof ArtifactPatchStreamEventSchema>;

export const EndStreamEventSchema = z.object({
  type: z.literal("end"),
  finishReason: z.enum(["stop", "length", "tool-calls", "error", "cancelled"]),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    })
    .optional(),
  durationMs: z.number().nonnegative().optional(),
});
export type EndStreamEvent = z.infer<typeof EndStreamEventSchema>;

export const ErrorStreamEventSchema = z.object({
  type: z.literal("error"),
  code: NotebookErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  statusCode: z.number().int(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ErrorStreamEvent = z.infer<typeof ErrorStreamEventSchema>;

export const SseEventSchema = z.discriminatedUnion("type", [
  StartStreamEventSchema,
  ChunkStreamEventSchema,
  ToolCallStreamEventSchema,
  ToolResultStreamEventSchema,
  CitationStreamEventSchema,
  ArtifactPatchStreamEventSchema,
  EndStreamEventSchema,
  ErrorStreamEventSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
