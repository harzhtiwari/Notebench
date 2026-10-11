import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type Logger } from "@notebook/logger";
import type { NotebookErrorCode, DocWorkerProbe, NotebookRepositoryPort } from "@notebook/contracts";
import {
  createSqliteDatabase,
  SqliteNotebookRepository,
  initializeSqliteSchema,
  type SqliteDatabaseInstance,
} from "@notebook/infra-db";
import { NotebookService } from "@notebook/domain-notebooks";
import { notebooksRoutes } from "./routes/notebooks.js";

export interface BuildServerOptions extends FastifyServerOptions {
  staticDir?: string | undefined;
  customLogger?: Logger | undefined;
  docWorkerPool?: DocWorkerProbe | undefined;
  db?: SqliteDatabaseInstance | undefined;
  notebookRepo?: NotebookRepositoryPort | undefined;
  notebookService?: NotebookService | undefined;
  defaultUserId?: string | undefined;
}

/**
 * Builds and configures the Notebench Fastify composition root.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const {
    staticDir,
    customLogger,
    docWorkerPool,
    db,
    notebookRepo: customRepo,
    notebookService: customService,
    defaultUserId: customUserId,
    ...fastifyOptions
  } = options;

  const defaultUserId = customUserId ?? "11111111-1111-4111-8111-111111111111";
  const appLogger = customLogger ?? createLogger({ name: "server", level: "info" });

  const app = fastify({
    logger: fastifyOptions.logger ?? false,
    ...fastifyOptions,
  });

  // Enable CORS for API requests
  await app.register(cors, {
    origin: true,
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

  // Notebooks Domain & Routes
  let notebookRepo = customRepo;
  let notebookService = customService;

  if (!notebookService && !notebookRepo) {
    const dbInstance = db ?? createSqliteDatabase();
    initializeSqliteSchema(dbInstance.sqlite);
    const now = new Date().toISOString();
    dbInstance.sqlite.exec(`
      INSERT OR IGNORE INTO users (id, email, display_name, role, created_at, updated_at)
      VALUES ('${defaultUserId}', 'owner@notebench.local', 'Owner', 'owner', '${now}', '${now}');
    `);
    notebookRepo = new SqliteNotebookRepository(dbInstance.db, dbInstance.sqlite);
    notebookService = new NotebookService(notebookRepo);
  } else if (!notebookService && notebookRepo) {
    notebookService = new NotebookService(notebookRepo);
  }

  await app.register(notebooksRoutes, {
    notebookService,
    notebookRepo,
    defaultUserId,
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
