import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createLogger, type Logger } from "@notebook/logger";
import {
  createJsonRpcRequest,
  type JsonRpcId,
  JsonRpcResponseSchema,
  ParserFailedError,
} from "@notebook/contracts";

export interface WorkerProcessOptions {
  projectDir: string;
  requestTimeoutMs?: number | undefined;
  logger?: Logger | undefined;
}


interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export class DocWorkerProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private readonly projectDir: string;
  private readonly requestTimeoutMs: number;
  private readonly logger: Logger;
  private buffer = "";
  private readonly pendingRequests = new Map<string | number, PendingRequest>();
  private isAlive = false;
  private isExpectedExit = false;
  private processPid = 0;

  constructor(options: WorkerProcessOptions) {
    super();
    this.projectDir = options.projectDir;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
    this.logger = options.logger ?? createLogger({ name: "doc-worker-process" });
  }

  private workerPid = 0;

  public get pid(): number {
    return this.workerPid || this.processPid;
  }

  public get alive(): boolean {
    return this.isAlive;
  }

  public get pendingCount(): number {
    return this.pendingRequests.size;
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const child = spawn(
          "uv",
          ["run", "--project", this.projectDir, "python", "-m", "doc_tools.worker"],
          {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          }
        );

        this.child = child;
        this.processPid = child.pid ?? 0;
        this.isAlive = true;
        this.isExpectedExit = false;

        child.stdout?.on("data", (chunk: Buffer) => {
          this.handleStdout(chunk);
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8").trim();
          if (text) {
            this.logger.debug(`[doc-worker:${this.processPid}] ${text}`);
          }
        });

        child.once("error", (err: Error) => {
          this.isAlive = false;
          this.logger.error(
            { pid: this.processPid },
            `Failed to spawn doc-worker subprocess: ${err.message}`
          );
          reject(new ParserFailedError(`Failed to spawn doc-worker: ${err.message}`));
        });


        child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
          this.handleExit(code, signal);
        });

        // Resolve after child process spawn confirms alive
        if (child.pid) {
          resolve();
        } else {
          reject(new ParserFailedError("Failed to obtain child process PID"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new ParserFailedError(`Failed to initialize doc-worker: ${msg}`));
      }
    });

    // Execute handshake ping to verify responsiveness and record actual Python PID
    const probe = await this.send<{ pong: boolean; workerPid: number }>("ping");
    this.workerPid = probe.workerPid;
  }


  public send<TResult>(method: string, params?: unknown): Promise<TResult> {
    if (!this.isAlive || !this.child?.stdin) {
      return Promise.reject(
        new ParserFailedError(`Worker process ${this.processPid} is not alive or stdin is closed`)
      );
    }

    const request = createJsonRpcRequest(method, params);
    const id = request.id;

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new ParserFailedError(
            `Worker request timed out after ${this.requestTimeoutMs}ms for method '${method}'`
          )
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (val: unknown) => {
          resolve(val as TResult);
        },
        reject,
        timer,
      });

      const payload = JSON.stringify(request) + "\n";
      this.child?.stdin?.write(payload, "utf-8", (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new ParserFailedError(`Failed to write to worker stdin: ${err.message}`));
        }
      });
    });
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString("utf-8");
    let newlineIdx = this.buffer.indexOf("\n");

    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (line.length > 0) {
        this.processLine(line);
      }
      newlineIdx = this.buffer.indexOf("\n");
    }
  }

  private processLine(line: string): void {
    try {
      const raw: unknown = JSON.parse(line);
      const parsed = JsonRpcResponseSchema.safeParse(raw);
      if (!parsed.success) {
        this.logger.warn({ line }, "Received malformed JSON-RPC frame from worker");
        return;
      }

      const response = parsed.data;
      const id: JsonRpcId = response.id;
      if (id === null) {
        if ("error" in response) {
          const parseErr = new ParserFailedError(response.error.message, {
            code: response.error.code,
            ...(response.error.data !== undefined ? { data: response.error.data } : {}),
          });
          for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timer);
            pending.reject(parseErr);
          }
          this.pendingRequests.clear();
        }
        return;
      }

      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);

      if ("error" in response) {
        pending.reject(
          new ParserFailedError(response.error.message, {
            code: response.error.code,
            ...(response.error.data !== undefined ? { data: response.error.data } : {}),
          })
        );
      } else {
        pending.resolve(response.result);
      }
    } catch (err) {
      this.logger.error({ line, error: String(err) }, "Error decoding worker stdout line");
    }
  }

  private killProcess(signal: NodeJS.Signals): void {
    if (this.workerPid) {
      try {
        process.kill(this.workerPid);
        return;
      } catch {
        // Fall through to child.kill
      }
    }
    this.child?.kill(signal);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.isAlive = false;
    const unexpected = !this.isExpectedExit;

    if (unexpected) {
      this.logger.error(
        `Worker process ${this.processPid} crashed unexpectedly (code=${code}, signal=${signal})`
      );
    }

    const abortError = new ParserFailedError(
      `Worker process ${this.processPid} terminated (code=${code}, signal=${signal})`
    );

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(abortError);
    }
    this.pendingRequests.clear();

    this.emit("exit", {
      pid: this.processPid,
      code,
      signal,
      unexpected,
    });
  }

  public simulateCrash(): void {
    if (this.child && this.isAlive) {
      this.isExpectedExit = false;
      this.killProcess("SIGKILL");
    }
  }

  public async stop(): Promise<void> {
    if (!this.isAlive || !this.child) {
      return;
    }

    this.isExpectedExit = true;

    return new Promise<void>((resolve) => {
      const proc = this.child;
      if (!proc) {
        resolve();
        return;
      }

      const forceKillTimer = setTimeout(() => {
        this.killProcess("SIGKILL");
        resolve();
      }, 1500);

      proc.once("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      this.killProcess("SIGTERM");
    });
  }
}


