import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type Logger } from "@notebook/logger";
import type { NotebookErrorCode, DocWorkerProbe, NotebookRepositoryPort } from "@notebook/contracts";
import type { SqliteHealthProbeTarget } from "@notebook/domain-ops";
import { OwnerSetupService, Argon2PasscodeHasher } from "@notebook/domain-account";
import { NotebookService } from "@notebook/domain-notebooks";
import {
  createSqliteDatabase,
  SqliteAccountRepository,
  SqliteNotebookRepository,
  initializeSqliteSchema,
  type SqliteDatabaseInstance,
} from "@notebook/infra-db";
import { setupRoutes } from "./routes/setup.js";
import { notebooksRoutes } from "./routes/notebooks.js";
import { registerDoctorRoutes } from "./routes/doctor.js";

export interface BuildServerOptions extends FastifyServerOptions {
  staticDir?: string | undefined;
  customLogger?: Logger | undefined;
  docWorkerPool?: DocWorkerProbe | undefined;
  sqliteDb?: SqliteHealthProbeTarget | undefined;
  serverHost?: string | undefined;
  hasOwnerPasscode?: boolean | undefined;
  ownerSetupService?: OwnerSetupService | undefined;
  dbPath?: string | undefined;
  /** Alias for sqliteInstance, accepted for test ergonomics */
  db?: SqliteDatabaseInstance | undefined;
  sqliteInstance?: SqliteDatabaseInstance | undefined;
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
    sqliteDb,
    serverHost,
    hasOwnerPasscode,
    notebookRepo: customNotebookRepo,
    notebookService: customNotebookService,
    defaultUserId: customUserId,
    ...fastifyOptions
  } = options;

  // Support `db` as an ergonomic alias for `sqliteInstance` (used in tests)
  const resolvedSqliteInstance = options.sqliteInstance ?? options.db;

  const defaultUserId = customUserId ?? "11111111-1111-4111-8111-111111111111";
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

  // System diagnostic endpoint (NOTEBENCH Decision 8.8)
  registerDoctorRoutes(app, {
    docWorkerPool,
    sqliteDb,
    serverHost,
    hasOwnerPasscode,
    appLogger,
  });

  // Owner setup and application access state routes (Ticket 01)
  let setupService = options.ownerSetupService;
  if (!setupService) {
    const sqliteInstance = resolvedSqliteInstance ?? createSqliteDatabase({
      dbPath: options.dbPath,
    });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new Argon2PasscodeHasher();
    setupService = new OwnerSetupService({ repository: repo, hasher });
  }

  await app.register(setupRoutes, {
    ownerSetupService: setupService,
  });

  // Notebooks domain routes (Ticket 05)
  let notebookRepo = customNotebookRepo;
  let notebookService = customNotebookService;

  if (!notebookService && !notebookRepo) {
    const dbInstance = resolvedSqliteInstance ?? createSqliteDatabase({ dbPath: options.dbPath });
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
