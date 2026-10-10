import { spawn } from "node:child_process";
import os from "node:os";
import { resolve } from "node:path";
import { createLogger, type Logger } from "@notebook/logger";
import {
  type DocWorkerPingResult,
  type DocWorkerInfoResult,
  type PdfExtractorPort,
  type PdfPreflightResult,
  PdfPreflightResultSchema,
  type PdfExtractResult,
  PdfExtractResultSchema,
  ParserFailedError,
} from "@notebook/contracts";
import { DocWorkerProcess } from "./worker-process.js";

export interface DocWorkerPoolOptions {
  projectDir?: string | undefined;
  minWorkers?: number | undefined;
  maxWorkers?: number | undefined;
  requestTimeoutMs?: number | undefined;
  logger?: Logger | undefined;
}

export interface DocWorkerPoolStats {
  activeWorkers: number;
  busyWorkers: number;
  totalWorkers: number;
}

export interface WorkerExitInfo {
  pid: number;
  code: number | null;
  signal: NodeJS.Signals | null;
  unexpected: boolean;
}

export class DocWorkerPool implements PdfExtractorPort {
  private readonly projectDir: string;
  private readonly minWorkers: number;
  private readonly maxWorkers: number;
  private readonly requestTimeoutMs: number;
  private readonly logger: Logger;
  private readonly workers: DocWorkerProcess[] = [];
  private isStarted = false;
  private isStopped = false;

  constructor(options: DocWorkerPoolOptions = {}) {
    this.projectDir = options.projectDir ?? resolve(process.cwd(), "tools/doc-tools");
    const cpus = os.cpus()?.length ?? 2;
    // Cap at min(2, os.cpus() - 1) per Settled Decision 9.2
    const defaultConcurrency = Math.min(2, Math.max(1, cpus - 1));

    this.minWorkers = options.minWorkers ?? defaultConcurrency;
    this.maxWorkers = options.maxWorkers ?? Math.max(this.minWorkers, defaultConcurrency);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
    this.logger = options.logger ?? createLogger({ name: "doc-worker-pool" });
  }

  public async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    this.isStopped = false;

    this.logger.info(
      {
        minWorkers: this.minWorkers,
        maxWorkers: this.maxWorkers,
        projectDir: this.projectDir,
      },
      "Initializing DocWorkerPool"
    );

    // Assert virtualenv integrity via Astral uv sync (zero virtualenv drift)
    await new Promise<void>((resolve, reject) => {
      const syncProc = spawn("uv", ["sync", "--project", this.projectDir], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      syncProc.once("error", (err: Error) => {
        reject(new ParserFailedError(`Failed to run Astral uv sync: ${err.message}`));
      });

      syncProc.once("exit", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new ParserFailedError(`Astral uv sync failed with exit code ${code}`));
        }
      });
    });

    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < this.minWorkers; i++) {
      spawnPromises.push(
        this.spawnWorker().then(() => {
          // Worker ready
        })
      );
    }

    await Promise.all(spawnPromises);
    this.logger.info(`DocWorkerPool successfully initialized with ${this.workers.length} workers`);
  }


  public async send<TResult>(method: string, params?: unknown): Promise<TResult> {
    if (this.isStopped || !this.isStarted) {
      throw new ParserFailedError("DocWorkerPool is not running or has been stopped");
    }

    const worker = await this.acquireWorker();
    return worker.send<TResult>(method, params);
  }

  public async ping(): Promise<DocWorkerPingResult> {
    return this.send<DocWorkerPingResult>("ping");
  }

  public async getWorkerInfo(): Promise<DocWorkerInfoResult> {
    return this.send<DocWorkerInfoResult>("get_worker_info");
  }

  public async preflightPdf(filePath: string): Promise<PdfPreflightResult> {
    const raw = await this.send<unknown>("pdf_preflight", { filePath });
    return PdfPreflightResultSchema.parse(raw);
  }

  public async extractPdf(
    filePath: string,
    options?: { maxPages?: number | undefined }
  ): Promise<PdfExtractResult> {
    const params: { filePath: string; maxPages?: number } = { filePath };
    if (options?.maxPages !== undefined) {
      params.maxPages = options.maxPages;
    }
    const raw = await this.send<unknown>("pdf_extract", params);
    return PdfExtractResultSchema.parse(raw);
  }


  public stats(): DocWorkerPoolStats {
    const active = this.workers.filter((w) => w.alive);
    const busy = active.filter((w) => w.pendingCount > 0);
    return {
      activeWorkers: active.length,
      busyWorkers: busy.length,
      totalWorkers: this.workers.length,
    };
  }

  public simulateCrash(pid: number): void {
    const worker = this.workers.find((w) => w.pid === pid);
    if (worker) {
      worker.simulateCrash();
    }
  }

  public async stop(): Promise<void> {
    if (this.isStopped) return;
    this.isStopped = true;
    this.isStarted = false;

    this.logger.info("Shutting down DocWorkerPool");
    const activeWorkers = [...this.workers];
    this.workers.length = 0;

    await Promise.all(activeWorkers.map((w) => w.stop()));
    this.logger.info("DocWorkerPool stopped cleanly");
  }

  private async spawnWorker(): Promise<DocWorkerProcess> {
    const worker = new DocWorkerProcess({
      projectDir: this.projectDir,
      requestTimeoutMs: this.requestTimeoutMs,
      logger: this.logger,
    });

    worker.on("exit", (info: WorkerExitInfo) => {
      this.handleWorkerExit(worker, info);
    });

    await worker.start();
    this.workers.push(worker);
    return worker;
  }

  private handleWorkerExit(worker: DocWorkerProcess, info: WorkerExitInfo): void {
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }


    if (info.unexpected && !this.isStopped) {
      this.logger.warn(`Worker PID ${info.pid} died unexpectedly. Auto-respawning replacement worker...`);
      void this.spawnWorker().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to auto-respawn worker: ${msg}`);
      });
    }
  }

  private async acquireWorker(): Promise<DocWorkerProcess> {
    const liveWorkers = this.workers.filter((w) => w.alive);

    if (liveWorkers.length === 0) {
      if (!this.isStopped) {
        // Emergency respawn if all crashed
        const newWorker = await this.spawnWorker();
        return newWorker;
      }
      throw new ParserFailedError("No available doc-workers in pool");
    }

    // Sort by pending requests (least busy first)
    liveWorkers.sort((a, b) => a.pendingCount - b.pendingCount);
    const leastBusy = liveWorkers[0];

    if (!leastBusy) {
      throw new ParserFailedError("Failed to select available doc-worker");
    }

    // If least busy already has pending tasks and pool has room to grow
    if (leastBusy.pendingCount > 0 && liveWorkers.length < this.maxWorkers) {
      try {
        const scaledWorker = await this.spawnWorker();
        return scaledWorker;
      } catch {
        // Fallback to least busy if spawn fails
        return leastBusy;
      }
    }

    return leastBusy;
  }
}
