import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, createChildLogger } from "./logger.js";
import { InvarianceViolationError } from "@notebench/contracts";

function createMemoryDestination() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return {
    stream,
    getLogs: () => chunks.map((c) => JSON.parse(c) as Record<string, unknown>),
  };
}

describe("@notebench/logger Structured Pino Logger", () => {
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

  it("redacts vault secret fields including masterKey, provider keys, and headers", () => {
    const memory = createMemoryDestination();
    const logger = createLogger({
      name: "vault-logger",
      level: "info",
      destination: memory.stream,
    });

    logger.info(
      {
        masterKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        openaiKey: "sk-proj-super-secret-openai-key",
        anthropicKey: "sk-ant-super-secret-claude-key",
        googleKey: "AIzaSySuperSecretGeminiKey",
        plaintext: "sensitive-unencrypted-secret",
        headers: {
          "x-goog-api-key": "AIzaSyHeaderKey",
          "anthropic-api-key": "sk-ant-header-key",
        },
      },
      "Vault operation completed"
    );

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0] as {
      masterKey: string;
      openaiKey: string;
      anthropicKey: string;
      googleKey: string;
      plaintext: string;
      headers: { "x-goog-api-key": string; "anthropic-api-key": string };
    };

    expect(entry.masterKey).toBe("[REDACTED]");
    expect(entry.openaiKey).toBe("[REDACTED]");
    expect(entry.anthropicKey).toBe("[REDACTED]");
    expect(entry.googleKey).toBe("[REDACTED]");
    expect(entry.plaintext).toBe("[REDACTED]");
    expect(entry.headers["x-goog-api-key"]).toBe("[REDACTED]");
    expect(entry.headers["anthropic-api-key"]).toBe("[REDACTED]");
  });

  it("redacts passcode plaintext at the top level and in nested objects (Ticket 01 review D2)", () => {
    const memory = createMemoryDestination();
    const logger = createLogger({
      name: "passcode-logger",
      level: "info",
      destination: memory.stream,
    });

    const canary = "PASSCODE-CANARY-DO-NOT-LOG-999888";
    logger.info(
      {
        passcode: canary,
        request: { passcode: canary },
        request2: { body: { passcode: canary } },
        owner: { displayName: "alice" },
      },
      "Setup attempt with passcode"
    );

    const logs = memory.getLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0] as {
      passcode: string;
      request: { passcode: string };
      request2: { body: { passcode: string } };
      owner: { displayName: string };
    };

    expect(entry.passcode).toBe("[REDACTED]");
    expect(entry.request.passcode).toBe("[REDACTED]");
    expect(entry.request2.body.passcode).toBe("[REDACTED]");
    expect(entry.owner.displayName).toBe("alice");
    expect(JSON.stringify(logs)).not.toContain(canary);
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
