import { z } from "zod";

/**
Standard JSON-RPC 2.0 error codes per RFC specification.
*/
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32_700,
  INVALID_REQUEST: -32_600,
  METHOD_NOT_FOUND: -32_601,
  INVALID_PARAMS: -32_602,
  INTERNAL_ERROR: -32_603,
  SERVER_ERROR_RESERVED: -32_000,
} as const;

/**
JSON-RPC 2.0 error code: a well-known code from JSON_RPC_ERROR_CODES or any
server-defined numeric code.
*/
export type JsonRpcErrorCode = number;

/**
JSON-RPC 2.0 ID type: string, number, or null.
*/
export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

/**
JSON-RPC 2.0 Request Frame Schema.
*/
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

/**
JSON-RPC 2.0 Notification Frame Schema (no id).
*/
export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

/**
JSON-RPC 2.0 Error Object Schema.
*/
export const JsonRpcErrorObjectSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcErrorObject = z.infer<typeof JsonRpcErrorObjectSchema>;

/**
JSON-RPC 2.0 Error Response Frame Schema.
*/
export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema,
  error: JsonRpcErrorObjectSchema,
});
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>;

/**
JSON-RPC 2.0 Success Response Frame Schema.
*/
export const JsonRpcSuccessResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    result: z.unknown(),
  })
  .refine((value) => "result" in value, {
    message: "JSON-RPC success response must have 'result' property",
  });
export type JsonRpcSuccessResponse = z.infer<typeof JsonRpcSuccessResponseSchema>;

/**
JSON-RPC 2.0 Response Frame Union (Success or Error).
*/
export const JsonRpcResponseSchema = z.union([
  JsonRpcErrorResponseSchema,
  JsonRpcSuccessResponseSchema,
]);
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

/**
Doc-worker specific RPC ping response schema.
*/
export const DocWorkerPingResultSchema = z.object({
  pong: z.literal(true),
  timestamp: z.number(),
  pythonVersion: z.string(),
  workerPid: z.number(),
});
export type DocWorkerPingResult = z.infer<typeof DocWorkerPingResultSchema>;

/**
Port contract for querying doc-worker liveness.
*/
export interface DocWorkerProbe {
  ping(): Promise<DocWorkerPingResult>;
}


/**
Doc-worker info probe response schema.
*/
export const DocWorkerInfoResultSchema = z.object({
  name: z.string(),
  version: z.string(),
  pythonVersion: z.string(),
  workerPid: z.number(),
  capabilities: z.array(z.string()),
});
export type DocWorkerInfoResult = z.infer<typeof DocWorkerInfoResultSchema>;

/**
Factory helpers for generating JSON-RPC frames.
*/
const requestIdState = { next: 1 };

export function generateJsonRpcId(): number {
  return requestIdState.next++;
}

export function createJsonRpcRequest(
  method: string,
  parameters?: unknown,
  id: string | number = generateJsonRpcId()
): JsonRpcRequest {
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method,
  };
  if (parameters !== undefined) {
    request.params = parameters;
  }
  return request;
}

export function createJsonRpcSuccessResponse(
  id: string | number,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function createJsonRpcErrorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  const errRes: JsonRpcErrorResponse = {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
  if (data !== undefined) {
    errRes.error.data = data;
  }
  return errRes;
}
