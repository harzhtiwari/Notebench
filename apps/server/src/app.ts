import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type Logger } from "@notebook/logger";
import type { NotebookErrorCode } from "@notebook/contracts";

export interface BuildServerOptions extends FastifyServerOptions {
  staticDir?: string | undefined;
  customLogger?: Logger | undefined;
}

/**
 * Builds and configures the Notebench Fastify composition root.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const { staticDir, customLogger, ...fastifyOptions } = options;

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
    return {
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
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
