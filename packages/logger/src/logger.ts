import { pino, type Logger, type LoggerOptions } from "pino";
import type { LoggerConfig, LogContext, LogLevel } from "./types.js";
import { DEFAULT_REDACT_PATHS, CENSOR_VALUE } from "./redact.js";
import { safeErrorSerializer } from "./serializers.js";
import { createDefaultDestination } from "./transports.js";

export function createLogger(config?: LoggerConfig): Logger {
  const destination = config?.destination ?? createDefaultDestination();

  const options: LoggerOptions = {
    name: config?.name ?? "notebench",
    level: config?.level ?? (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info",
    redact: {
      paths: config?.redactPaths ?? DEFAULT_REDACT_PATHS,
      censor: CENSOR_VALUE,
    },
    serializers: {
      err: safeErrorSerializer,
    },
  };

  return pino(options, destination);
}

export function createChildLogger(parent: Logger, context: LogContext): Logger {
  return parent.child(context);
}

export const rootLogger: Logger = createLogger();
