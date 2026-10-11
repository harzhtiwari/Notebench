import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type Logger } from "@notebook/logger";
import type { NotebookErrorCode, DocWorkerProbe } from "@notebook/contracts";
import { OwnerSetupService, Argon2PasscodeHasher } from "@notebook/domain-account";
import {
  createSqliteDatabase,
  SqliteAccountRepository,
  type SqliteDatabaseInstance,
} from "@notebook/infra-db";
import { setupRoutes } from "./routes/setup.js";

export interface BuildServerOptions extends FastifyServerOptions {
  staticDir?: string | undefined;
  customLogger?: Logger | undefined;
  docWorkerPool?: DocWorkerProbe | undefined;
  ownerSetupService?: OwnerSetupService | undefined;
  dbPath?: string | undefined;
  sqliteInstance?: SqliteDatabaseInstance | undefined;
}



/**
 * Builds and configures the Notebench Fastify composition root.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const { staticDir, customLogger, docWorkerPool, ...fastifyOptions } = options;

  const appLogger = customLogger ?? createLogger({ name: "server", level: "info" });

  const app = fastify({
    logger: fastifyOptions.logger ?? false,
    ...fastifyOptions,
  });

  // CORS: localhost origins only (dev web server on a dynamic port). Credentials are
  // required so the HttpOnly session cookie reaches the API cross-origin in dev.
  // Production serves the SPA same-origin from this daemon, so no wider access is needed.
  await app.register(cors, {
    origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    credentials: true,
  });

  // Health probe endpoints
  app.get("/healthz", async () => {
    return { status: "ok" };
  });

  app.get("/livez", async () => {
    return { status: "ok" };
  });

  // System diagnostic endpoint
  app.get("/api/doctor", async () => {
    appLogger.debug("Doctor diagnostics probe requested");

    let docWorkerStatus: unknown = undefined;
    if (docWorkerPool) {
      try {
        const pingResult = await docWorkerPool.ping();
        docWorkerStatus = {
          status: "ok",
          ...pingResult,
        };
      } catch (err: unknown) {
        docWorkerStatus = {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...(docWorkerStatus !== undefined ? { docWorker: docWorkerStatus } : {}),
    };
  });

  // Owner setup and application access state routes
  let setupService = options.ownerSetupService;
  if (!setupService) {
    const sqliteInstance = options.sqliteInstance ?? createSqliteDatabase({
      dbPath: options.dbPath,
    });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new Argon2PasscodeHasher();
    setupService = new OwnerSetupService({ repository: repo, hasher });
  }

  await app.register(setupRoutes, {
    ownerSetupService: setupService,
  });
  // Static SPA assets & HTML5 history fallback
  const resolvedStaticDir = staticDir ?? resolve(process.cwd(), "apps/web/out");
  const hasStaticDir = existsSync(resolvedStaticDir);

  if (hasStaticDir) {
    await app.register(fastifyStatic, {
      root: resolvedStaticDir,
      prefix: "/",
      wildcard: false, // Handle routing fallback explicitly
    });
  }

  // Not Found / Fallback handler
  app.setNotFoundHandler(async (request, reply) => {
    // API routes return structured JSON error
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND" satisfies NotebookErrorCode,
          message: `API endpoint not found: ${request.method} ${request.url}`,
        },
      });
    }

    // Client-side routes fallback to static SPA index.html
    if (hasStaticDir && existsSync(resolve(resolvedStaticDir, "index.html"))) {
      return reply.sendFile("index.html");
    }

    return reply.status(404).send({
      error: {
        code: "NOT_FOUND" satisfies NotebookErrorCode,
        message: `Resource not found: ${request.url}`,
      },
    });
  });

  return app;
}
