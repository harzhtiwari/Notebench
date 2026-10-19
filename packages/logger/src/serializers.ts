import { stdSerializers } from "pino";
import { NotebookError } from "@notebench/contracts";

export interface SerializedError {
  name: string;
  message: string;
  stack?: string | undefined;
  code?: string | undefined;
  statusCode?: number | undefined;
  details?: Record<string, unknown> | undefined;
  cause?: unknown;
}

export function safeErrorSerializer(err: unknown): unknown {
  if (!(err instanceof Error)) {
    return err;
  }

  const baseSerialized = stdSerializers.err(err);
  const result: SerializedError = {
    name: baseSerialized.type,
    message: baseSerialized.message,
    stack: baseSerialized.stack,
  };

  if (err instanceof NotebookError) {
    result.code = err.code;
    result.statusCode = err.statusCode;
    if (err.details !== undefined) {
      result.details = err.details;
    }
  } else {
    // If other custom error with code / statusCode / details
    const maybeCustom = err as {
      code?: unknown;
      statusCode?: unknown;
      details?: unknown;
    };
    if (typeof maybeCustom.code === "string") {
      result.code = maybeCustom.code;
    }
    if (typeof maybeCustom.statusCode === "number") {
      result.statusCode = maybeCustom.statusCode;
    }
    if (typeof maybeCustom.details === "object" && maybeCustom.details !== null) {
      result.details = maybeCustom.details as Record<string, unknown>;
    }
  }

  if ("cause" in err && err.cause !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- defensive stringification of arbitrary cause values; must never throw
    result.cause = err.cause instanceof Error ? safeErrorSerializer(err.cause) : String(err.cause);
  }

  return result;
}
