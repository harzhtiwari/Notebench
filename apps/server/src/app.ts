import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createLogger, type Logger } from "@notebench/logger";
import type { NotebookErrorCode, DocWorkerProbe, NotebookRepositoryPort } from "@notebench/contracts";
import type { SqliteHealthProbeTarget } from "@notebench/domain-ops";
import { OwnerSetupService, Argon2PasscodeHasher, SessionService } from "@notebench/domain-account";
import { NotebookService } from "@notebench/domain-notebooks";
import { EncryptedVault, resolveMasterKey } from "@notebench/infra-vault";
import type { ProviderAdapter, ProviderId } from "@notebench/infra-llm";
import {
  createSqliteDatabase,
  SqliteAccountRepository,
  SqliteModelSelectionRepository,
  SqliteNotebookRepository,
  SqliteSessionRepository,
  SqliteVaultKeyRepository,
  initializeSqliteSchema,
  type SqliteDatabaseInstance,
} from "@notebench/infra-db";
import { setupRoutes } from "./routes/setup.js";
import { sessionRoutes } from "./routes/session.js";
import { providersRoutes, type ModelSelectionStore } from "./routes/providers.js";
import { SqliteVaultStorage } from "./vault-storage.js";
import { createSessionGuard, registerSessionSupport } from "./plugins/session.js";
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
  sessionService?: SessionService | undefined;
  cookieSecret?: string | undefined;
  vaultDir?: string | undefined;
  dbPath?: string | undefined;
  /** Alias for sqliteInstance, accepted for test ergonomics */
  db?: SqliteDatabaseInstance | undefined;
  sqliteInstance?: SqliteDatabaseInstance | undefined;
  notebookRepo?: NotebookRepositoryPort | undefined;
  notebookService?: NotebookService | undefined;
  defaultUserId?: string | undefined;
  /** Encrypted provider-key vault (Ticket 04). Defaults to SQLite-backed vault. */
  vault?: EncryptedVault | undefined;
  /** Chat/embedding model selection store (Ticket 04 D6). Defaults to SQLite. */
  modelSelections?: ModelSelectionStore | undefined;
  /** Provider adapter overrides (Ticket 04). Defaults to the full registry. */
  providerAdapters?: Partial<Record<ProviderId, ProviderAdapter>> | undefined;
}

/**
 * Locates the prebuilt web export (`apps/web/out`) from the workspace root,
 * regardless of which package directory the server starts in (repo root in
 * Docker, `apps/server` under `pnpm --filter`). Returns undefined outside a
 * workspace or when the export has not been built yet, so callers keep the
 * previous fallback behavior instead of serving a wrong directory.
 */
export function resolveWebOutDir(startDir: string = process.cwd()): string | undefined {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const candidate = join(dir, "apps", "web", "out");
      return existsSync(candidate) ? candidate : undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Builds and configures the Notebench Fastify composition root.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const {
    staticDir,
    customLogger,
    docWorkerPool,
    serverHost,
    hasOwnerPasscode,
    notebookRepo: customNotebookRepo,
    notebookService: customNotebookService,
    defaultUserId: customUserId,
    ...fastifyOptions
  } = options;

  // Support `db` as an ergonomic alias for `sqliteInstance` (used in tests)
  const resolvedSqliteInstance = options.sqliteInstance ?? options.db;

  // Shared SQLite handle for health probes (Decision 8.8): the doctor route
  // must query a real DB in production instead of reporting "not provided".
  // Reused by the domain blocks below so production opens one handle,
  // not three. Tests passing sqliteDb/sqliteInstance/db are unaffected.
  let sharedSqliteInstance = resolvedSqliteInstance;
  function ensureSharedSqlite(): SqliteDatabaseInstance {
    if (!sharedSqliteInstance) {
      sharedSqliteInstance = createSqliteDatabase({ dbPath: options.dbPath });
    }
    return sharedSqliteInstance;
  }
  const doctorSqliteDb =
    options.sqliteDb ?? sharedSqliteInstance?.sqlite ?? ensureSharedSqlite().sqlite;

  const defaultUserId = customUserId;
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

  // HTTP rate limiting (CodeQL js/missing-rate-limiting defense-in-depth).
  // global:false so health probes, static SPA, and read-only state GETs stay
  // unlimited; sensitive POSTs opt in via per-route config.rateLimit.
  // Ceilings sit strictly above the domain 5/60s lockout so the existing
  // 5x401->429 domain sequence stays observable. In-memory LRU: single-process
  // localhost daemon, no redis. No trustProxy, no loopback allowList.
  await app.register(rateLimit, {
    global: false,
    cache: 5000,
    allowList: [],
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: {
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Retry in ${String(context.after)}.`,
        details: {
          retryAfterSeconds: Math.ceil(context.ttl / 1000),
          limit: context.max,
        },
      },
    }),
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
    sqliteDb: doctorSqliteDb,
    serverHost,
    hasOwnerPasscode,
    appLogger,
  });

  // Owner setup and application access state routes (Ticket 01)
  let setupService = options.ownerSetupService;
  if (!setupService) {
    const sqliteInstance = sharedSqliteInstance ?? ensureSharedSqlite();
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new Argon2PasscodeHasher();
    setupService = new OwnerSetupService({ repository: repo, hasher });
  }

  await app.register(setupRoutes, {
    ownerSetupService: setupService,
  });

  // Session login/logout routes and global session guard (Ticket 02)
  let sessionService = options.sessionService;
  if (!sessionService) {
    const sqliteInstance = sharedSqliteInstance ?? ensureSharedSqlite();
    const accountRepo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const sessionRepo = new SqliteSessionRepository(sqliteInstance.db, sqliteInstance.sqlite);
    sessionService = new SessionService({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      hasher: new Argon2PasscodeHasher(),
    });
  }

  await registerSessionSupport(app, {
    sessionService,
    cookieSecret: options.cookieSecret,
    vaultDir: options.vaultDir,
  });
  await app.register(sessionRoutes, { sessionService });
  app.addHook(
    "preHandler",
    createSessionGuard({
      sessionService,
      isPasscodeRequired: async () => (await setupService.getAppState()).requiresPasscode,
    })
  );

  // Notebooks domain routes (Ticket 05)
  let notebookRepo = customNotebookRepo;
  let notebookService = customNotebookService;

  if (!notebookService && !notebookRepo) {
    const dbInstance = sharedSqliteInstance ?? ensureSharedSqlite();
    initializeSqliteSchema(dbInstance.sqlite);
    notebookRepo = new SqliteNotebookRepository(dbInstance.db, dbInstance.sqlite);
    notebookService = new NotebookService(notebookRepo);
  } else if (!notebookService && notebookRepo) {
    notebookService = new NotebookService(notebookRepo);
  }

  const resolveOwnerId = async (): Promise<string | null> => {
    const owner = await setupService.getOwner();
    return owner?.id ?? null;
  };

  await app.register(notebooksRoutes, {
    notebookService,
    notebookRepo,
    defaultUserId,
    resolveOwnerId,
  });

  // Provider key test, model discovery, key storage and model selection
  // (Ticket 04). Defaults compose the SQLite-backed vault and selections
  // over the shared handle, mirroring the account/session wiring above.
  let vault = options.vault;
  if (!vault) {
    const sqliteInstance = sharedSqliteInstance ?? ensureSharedSqlite();
    const { masterKey } = resolveMasterKey({ vaultDir: options.vaultDir, logger: appLogger });
    vault = new EncryptedVault(
      masterKey,
      new SqliteVaultStorage(new SqliteVaultKeyRepository(sqliteInstance.db, sqliteInstance.sqlite))
    );
  }
  let modelSelections: ModelSelectionStore;
  if (options.modelSelections) {
    modelSelections = options.modelSelections;
  } else {
    const sqliteInstance = sharedSqliteInstance ?? ensureSharedSqlite();
    modelSelections = new SqliteModelSelectionRepository(sqliteInstance.db, sqliteInstance.sqlite);
  }

  await app.register(providersRoutes, {
    ...(options.providerAdapters ? { adapters: options.providerAdapters } : {}),
    vault,
    selections: modelSelections,
    defaultUserId,
    resolveOwnerId,
  });

  // Static SPA assets & HTML5 history fallback
  // Prefer the workspace-root export (works from any package cwd); keep the
  // legacy cwd-relative path as a last resort for non-workspace layouts.
  const resolvedStaticDir =
    staticDir ?? resolveWebOutDir() ?? resolve(process.cwd(), "apps/web/out");
  const hasStaticDir = existsSync(resolvedStaticDir);

  if (hasStaticDir) {
    await app.register(fastifyStatic, {
      root: resolvedStaticDir,
      prefix: "/",
      wildcard: false, // Handle routing fallback explicitly
    });
  }

  // Not Found / Fallback handler
  // SPA fallback policy (ticket 06): only browser navigations (GET/HEAD
  // accepting HTML) fall back to the exported shell. API paths, stale asset
  // requests, and non-HTML probes get a structured JSON 404 instead — an API
  // path must never fall through to HTML. Rate-limited to blunt URL guessing.
  app.setNotFoundHandler(
    {
      preHandler: app.rateLimit({ max: 50, timeWindow: "1 minute" }),
    },
    async (request, reply) => {
    const url = request.url;
    // request.url carries the query string: match policy on the pathname so
    // `/api?x=1` cannot slip past the API exclusion into the HTML shell.
    const queryIndex = url.indexOf("?");
    const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
    const acceptHeader = request.headers.accept;
    const accept = Array.isArray(acceptHeader) ? acceptHeader.join(",") : (acceptHeader ?? "");
    const wantsHtml = accept === "" || accept.includes("text/html") || accept.includes("*/*");
    const isNavigation = request.method === "GET" || request.method === "HEAD";
    if (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      !isNavigation ||
      pathname === "/_next" ||
      pathname.startsWith("/_next/") ||
      !wantsHtml
    ) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND" satisfies NotebookErrorCode,
          message: `Resource not found: ${request.method} ${request.url}`,
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
