import { describe, it, expect } from "vitest";
import {
  JsonRpcRequestSchema,
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
  JsonRpcResponseSchema,
  DocWorkerPingResultSchema,
  DocWorkerInfoResultSchema,
  JSON_RPC_ERROR_CODES,
  createJsonRpcRequest,
  createJsonRpcSuccessResponse,
  createJsonRpcErrorResponse,
} from "./json-rpc.js";

describe("JSON-RPC 2.0 Contracts & Doc-Worker IPC Schemas", () => {
  it("validates valid JSON-RPC 2.0 request frames", () => {
    const validRequest = {
      jsonrpc: "2.0",
      id: "req-1",
      method: "ping",
      params: { timestamp: 123456789 },
    };

    const parsed = JsonRpcRequestSchema.safeParse(validRequest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("req-1");
      expect(parsed.data.method).toBe("ping");
    }
  });

  it("rejects invalid request frames missing jsonrpc version or id", () => {
    expect(
      JsonRpcRequestSchema.safeParse({
        id: 1,
        method: "ping",
      }).success
    ).toBe(false);

    expect(
      JsonRpcRequestSchema.safeParse({
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      }).success
    ).toBe(false);
  });

  it("validates valid JSON-RPC 2.0 success responses", () => {
    const validResponse = {
      jsonrpc: "2.0",
      id: "req-1",
      result: { pong: true, timestamp: 123456789, pythonVersion: "3.12.0", workerPid: 42 },
    };

    const parsed = JsonRpcSuccessResponseSchema.safeParse(validResponse);
    expect(parsed.success).toBe(true);
    expect(JsonRpcResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("validates valid JSON-RPC 2.0 error responses", () => {
    const errorResponse = {
      jsonrpc: "2.0",
      id: "req-2",
      error: {
        code: JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
        message: "Method not found",
        data: { method: "non_existent" },
      },
    };

    const parsed = JsonRpcErrorResponseSchema.safeParse(errorResponse);
    expect(parsed.success).toBe(true);
    expect(JsonRpcResponseSchema.safeParse(errorResponse).success).toBe(true);
  });

  it("validates doc-worker ping and info result payloads", () => {
    const pingPayload = {
      pong: true,
      timestamp: Date.now(),
      pythonVersion: "3.12.8",
      workerPid: 1234,
    };
    expect(DocWorkerPingResultSchema.safeParse(pingPayload).success).toBe(true);

    const infoPayload = {
      name: "doc-tools",
      version: "0.1.0",
      pythonVersion: "3.12.8",
      workerPid: 1234,
      capabilities: ["pdfplumber", "pypdf", "docx", "pptx"],
    };
    expect(DocWorkerInfoResultSchema.safeParse(infoPayload).success).toBe(true);
  });

  it("creates structured JSON-RPC frames with helper functions", () => {
    const req = createJsonRpcRequest("ping", { test: true }, 42);
    expect(req).toEqual({
      jsonrpc: "2.0",
      id: 42,
      method: "ping",
      params: { test: true },
    });

    const success = createJsonRpcSuccessResponse(42, { pong: true });
    expect(success).toEqual({
      jsonrpc: "2.0",
      id: 42,
      result: { pong: true },
    });

    const err = createJsonRpcErrorResponse(42, JSON_RPC_ERROR_CODES.INTERNAL_ERROR, "Worker crashed");
    expect(err).toEqual({
      jsonrpc: "2.0",
      id: 42,
      error: {
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: "Worker crashed",
      },
    });
  });
});
