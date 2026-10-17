import { z } from "zod";

export const HealthProbeStatusSchema = z.enum(["pass", "warn", "fail"]);
export type HealthProbeStatus = z.infer<typeof HealthProbeStatusSchema>;

export const HealthProbeIdSchema = z.enum([
  "node_runtime",
  "python_worker",
  "sqlite_wal",
  "sqlite_vec",
  "disk_capacity",
  "exposure",
]);
export type HealthProbeId = z.infer<typeof HealthProbeIdSchema>;

export const HealthProbeResultSchema = z.object({
  id: HealthProbeIdSchema,
  name: z.string(),
  status: HealthProbeStatusSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  thresholds: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number().optional(),
});
export type HealthProbeResult = z.infer<typeof HealthProbeResultSchema>;

export const DoctorReportSchema = z.object({
  status: z.enum(["ok", "warn", "error"]),
  version: z.string(),
  timestamp: z.string(),
  uptime: z.number(),
  memory: z.object({
    rss: z.number(),
    heapTotal: z.number(),
    heapUsed: z.number(),
    external: z.number(),
    arrayBuffers: z.number().optional(),
  }),
  probes: z.array(HealthProbeResultSchema),
  docWorker: z.unknown().optional(),
});
export type DoctorReport = z.infer<typeof DoctorReportSchema>;

export const HEALTH_THRESHOLDS = {
  nodeRuntime: {
    minVersion: "22.0.0",
  },
  pythonWorker: {
    maxPingMs: 2000,
  },
  sqliteWal: {
    expectedJournalMode: "wal",
  },
  sqliteVec: {
    requireVersion: true,
  },
  diskCapacity: {
    passBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    warnBytes: 1 * 1024 * 1024 * 1024, // 1 GB
  },
  exposure: {
    loopbackOnly: true,
    warningMessage:
      "Security Notice: Notebench is accessible on your local network without a passcode. Set a passcode in Account Settings.",
  },
} as const;

export interface HealthProbeDescriptor {
  id: HealthProbeId;
  name: string;
  description: string;
  thresholdLabel: string;
}

export const HEALTH_PROBE_DESCRIPTORS: readonly HealthProbeDescriptor[] = [
  {
    id: "node_runtime",
    name: "Node.js Runtime",
    description: "Evaluates active Node.js execution environment.",
    thresholdLabel: ">= 22.0.0",
  },
  {
    id: "python_worker",
    name: "Python Doc-Worker Pool",
    description: "Queries IPC JSON-RPC ping latency for python document tools.",
    thresholdLabel: "< 2,000 ms",
  },
  {
    id: "sqlite_wal",
    name: "SQLite Database",
    description: "Checks PRAGMA journal_mode configuration.",
    thresholdLabel: "wal",
  },
  {
    id: "sqlite_vec",
    name: "Vector Store",
    description: "Verifies sqlite-vec extension loading and version report.",
    thresholdLabel: "Extension loaded & version reported",
  },
  {
    id: "disk_capacity",
    name: "Disk Capacity",
    description: "Monitors storage space on .notebook/ partition via statfs.",
    thresholdLabel: ">= 5 GB pass, 1-5 GB warn, < 1 GB fail",
  },
  {
    id: "exposure",
    name: "Exposure Alert",
    description: "Inspects daemon network interface binding.",
    thresholdLabel: "Loopback binding only (127.0.0.1)",
  },
];
