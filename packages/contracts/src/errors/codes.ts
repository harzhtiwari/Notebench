import { z } from "zod";

export const NotebookErrorCodeSchema = z.enum([
  "PARSER_FAILED",
  "SSRF_BLOCKED",
  "RATE_LIMITED",
  "INVARIANCE_VIOLATION",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
]);

export type NotebookErrorCode = z.infer<typeof NotebookErrorCodeSchema>;
