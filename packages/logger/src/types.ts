import type { Logger, LevelWithSilent, DestinationStream } from "pino";

export type LogLevel = LevelWithSilent;

export interface LogContext {
  runId?: string | undefined;
  notebookId?: string | undefined;
  requestId?: string | undefined;
  module?: string | undefined;
  component?: string | undefined;
  userId?: string | undefined;
  [key: string]: unknown;
}

export interface LoggerConfig {
  name?: string | undefined;
  level?: LogLevel | undefined;
  destination?: DestinationStream | undefined;
  redactPaths?: string[] | undefined;
  pretty?: boolean | undefined;
}

export type { Logger };
