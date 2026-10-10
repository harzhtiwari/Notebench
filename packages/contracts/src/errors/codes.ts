import { z } from "zod";

export const NotebookErrorCodeSchema = z.enum([
  "PARSER_FAILED",
  "SSRF_BLOCKED",
  "RATE_LIMITED",
  "INVARIANCE_VIOLATION",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "INVALID_CONTENT_TYPE",
  "DUPLICATE_SOURCE",
]);

export type NotebookErrorCode = z.infer<typeof NotebookErrorCodeSchema>;
