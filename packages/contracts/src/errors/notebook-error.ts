import { type NotebookErrorCode } from "./codes.js";

export interface SerializedNotebookError {
  name: string;
  code: NotebookErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown> | undefined;
}

/**
 * Universal System Error Base Class.
 * Guaranteed to preserve prototype chains and stack traces across Node and browser runtimes.
 */
export abstract class NotebookError extends Error {
  abstract readonly code: NotebookErrorCode;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown> | undefined,
    options?: ErrorOptions
  ) {
    super(message, options);

    // 1. Restore prototype chain to concrete subclass constructor
    Object.setPrototypeOf(this, new.target.prototype);

    // 2. Set error name to concrete subclass name
    this.name = new.target.name;

    // 3. V8 clean stack trace capture (Node.js environments)
    if ("captureStackTrace" in Error && typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }

  /**
   * Serializes the error for network transport and logging.
   */
  public toJSON(): SerializedNotebookError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class ParserFailedError extends NotebookError {
  readonly code = "PARSER_FAILED" as const;
  readonly statusCode = 422 as const;
}

export class SsrfBlockedError extends NotebookError {
  readonly code = "SSRF_BLOCKED" as const;
  readonly statusCode = 403 as const;
}

export class RateLimitedError extends NotebookError {
  readonly code = "RATE_LIMITED" as const;
  readonly statusCode = 429 as const;
}

export class InvarianceViolationError extends NotebookError {
  readonly code = "INVARIANCE_VIOLATION" as const;
  readonly statusCode = 409 as const;
}

export class UnauthorizedError extends NotebookError {
  readonly code = "UNAUTHORIZED" as const;
  readonly statusCode = 401 as const;
}

export class NotFoundError extends NotebookError {
  readonly code = "NOT_FOUND" as const;
  readonly statusCode = 404 as const;
}

export class ValidationError extends NotebookError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly statusCode = 400 as const;
}
