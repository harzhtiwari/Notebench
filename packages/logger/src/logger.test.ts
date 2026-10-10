import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, createChildLogger } from "./logger.js";
import { InvarianceViolationError } from "@notebook/contracts";

function createMemoryDestination() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return {
    stream,
    getLogs: () => chunks.map((c) => JSON.parse(c) as Record<string, unknown>),
  };
}

describe("@notebook/logger Structured Pino Logger", () => {
  it("formats structured JSON logs with standard metadata", () => {
    const memory = createMemoryDestination();
    const logger = createLogger({
      name: "test-logger",
      level: "info",
      destination: memory.stream,
    });

    logger.info("Application initialized");

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry).toBeDefined();
    expect(entry?.["name"]).toBe("test-logger");
    expect(entry?.["msg"]).toBe("Application initialized");
    expect(typeof entry?.["time"]).toBe("number");
    expect(entry?.["level"]).toBe(30); // Pino info level is 30
  });

  it("propagates contextual identifiers via child loggers", () => {
    const memory = createMemoryDestination();
    const parent = createLogger({
      name: "parent-logger",
      level: "info",
      destination: memory.stream,
    });

    const child = createChildLogger(parent, {
      runId: "run-abc-123",
      module: "domain-rag",
      notebookId: "nb-999",
    });

    child.info({ chunkCount: 5 }, "Retrieval complete");

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry?.["runId"]).toBe("run-abc-123");
    expect(entry?.["module"]).toBe("domain-rag");
    expect(entry?.["notebookId"]).toBe("nb-999");
    expect(entry?.["chunkCount"]).toBe(5);
    expect(entry?.["msg"]).toBe("Retrieval complete");
  });

  it("redacts sensitive keys including passwords, tokens, and apiKeys", () => {
    const memory = createMemoryDestination();
    const logger = createLogger({
      name: "security-logger",
      level: "info",
      destination: memory.stream,
    });

    logger.info(
      {
        user: {
          username: "alice",
          password: "SuperSecretPassword123!",
          token: "jwt.secret.token",
        },
        apiKey: "sk-live-1234567890",
        headers: {
          authorization: "Bearer super-secret-jwt",
        },
      },
      "Authentication event"
    );

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0] as {
      user: { username: string; password: string; token: string };
      apiKey: string;
      headers: { authorization: string };
    };

    expect(entry.user.username).toBe("alice");
    expect(entry.user.password).toBe("[REDACTED]");
    expect(entry.user.token).toBe("[REDACTED]");
    expect(entry.apiKey).toBe("[REDACTED]");
    expect(entry.headers.authorization).toBe("[REDACTED]");
  });

  it("safely serializes NotebookError instances with code, statusCode, and details", () => {
    const memory = createMemoryDestination();
    const logger = createLogger({
      name: "error-logger",
      level: "error",
      destination: memory.stream,
    });

    const error = new InvarianceViolationError("Sibling block mismatch", {
      blockId: "block-1",
      expectedHash: "abc",
      actualHash: "xyz",
    });

    logger.error({ err: error }, "Failed to patch artifact");

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0] as {
      err: {
        name: string;
        message: string;
        code: string;
        statusCode: number;
        details: Record<string, unknown>;
        stack?: string;
      };
      msg: string;
    };

    expect(entry.msg).toBe("Failed to patch artifact");
    expect(entry.err.name).toBe("InvarianceViolationError");
    expect(entry.err.message).toBe("Sibling block mismatch");
    expect(entry.err.code).toBe("INVARIANCE_VIOLATION");
    expect(entry.err.statusCode).toBe(409);
    expect(entry.err.details).toEqual({
      blockId: "block-1",
      expectedHash: "abc",
      actualHash: "xyz",
    });
    expect(entry.err.stack).toBeDefined();
  });
});
