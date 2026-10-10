import { describe, it, expect } from "vitest";
import {
  NotebookError,
  ParserFailedError,
  SsrfBlockedError,
  RateLimitedError,
  InvarianceViolationError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  PayloadTooLargeError,
  InvalidContentTypeError,
  DuplicateSourceError,
  NotebookErrorCodeSchema,
} from "./index.js";

describe("NotebookError Hierarchy", () => {
  it("validates all expected error codes in NotebookErrorCodeSchema", () => {
    const validCodes = [
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
    ];

    for (const code of validCodes) {
      expect(NotebookErrorCodeSchema.safeParse(code).success).toBe(true);
    }

    expect(NotebookErrorCodeSchema.safeParse("UNKNOWN_CODE").success).toBe(false);
  });

  it("creates concrete errors with correct prototype chain, name, code, and status", () => {
    const error = new InvarianceViolationError("Sibling block mutated", {
      blockId: "block-123",
      expectedHash: "abc",
      actualHash: "xyz",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NotebookError);
    expect(error).toBeInstanceOf(InvarianceViolationError);
    expect(error.name).toBe("InvarianceViolationError");
    expect(error.code).toBe("INVARIANCE_VIOLATION");
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe("Sibling block mutated");
    expect(error.details).toEqual({
      blockId: "block-123",
      expectedHash: "abc",
      actualHash: "xyz",
    });

    const serialized = error.toJSON();
    expect(serialized).toEqual({
      name: "InvarianceViolationError",
      code: "INVARIANCE_VIOLATION",
      message: "Sibling block mutated",
      statusCode: 409,
      details: {
        blockId: "block-123",
        expectedHash: "abc",
        actualHash: "xyz",
      },
    });
  });

  it("maps status codes correctly for all concrete error classes", () => {
    expect(new ParserFailedError("fail").statusCode).toBe(422);
    expect(new SsrfBlockedError("blocked").statusCode).toBe(403);
    expect(new RateLimitedError("rate").statusCode).toBe(429);
    expect(new InvarianceViolationError("hash").statusCode).toBe(409);
    expect(new UnauthorizedError("auth").statusCode).toBe(401);
    expect(new NotFoundError("none").statusCode).toBe(404);
    expect(new ValidationError("bad").statusCode).toBe(400);
    expect(new PayloadTooLargeError("too big").statusCode).toBe(413);
    expect(new InvalidContentTypeError("bad type").statusCode).toBe(415);
    expect(new DuplicateSourceError("duplicate").statusCode).toBe(409);
  });
});
