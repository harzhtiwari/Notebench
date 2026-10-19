import type {
  HealthProbeId,
  HealthProbeResult,
  DocWorkerProbe,
} from "@notebench/contracts";

export interface SqliteHealthProbeTarget {
  pragma(pragmaStatement: string, options?: { simple?: boolean }): unknown;
  prepare(sql: string): { get(...params: unknown[]): unknown };
}

export interface StatFsResult {
  bsize: number | bigint;
  bavail: number | bigint;
  blocks?: number | bigint | undefined;
}

export interface HealthProbeContext {
  nodeVersion?: string | undefined;
  docWorkerPool?: DocWorkerProbe | undefined;
  sqliteDb?: SqliteHealthProbeTarget | undefined;
  notebookDir?: string | undefined;
  statfsFn?: ((path: string) => Promise<StatFsResult>) | undefined;
  serverHost?: string | undefined;
  hasOwnerPasscode?: boolean | undefined;
}

export interface HealthProbeDefinition {
  id: HealthProbeId;
  name: string;
  run: (context?: HealthProbeContext) => Promise<HealthProbeResult>;
  thresholds: unknown;
}
