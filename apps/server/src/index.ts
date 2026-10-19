import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { buildServer } from "./app.js";
import { DocWorkerPool } from "@notebench/infra-doc-worker";

/**
Port-file contract for the dev orchestrator .

Standalone runs keep today's behavior: a CWD-relative flat
`.tmp/ports/server.port` written after listen and removed on close. When
the orchestrator provides an absolute path via `NOTEBENCH_SERVER_PORT_FILE`
(alias `NB_SERVER_PORT_FILE`), the server writes and cleans that file
instead, so namespaced records stay under the disposable root.
*/
function resolvePortFilePath(): string {
  const override =
    process.env["NOTEBENCH_SERVER_PORT_FILE"] ?? process.env["NB_SERVER_PORT_FILE"];
  return override !== undefined && override !== "" && path.isAbsolute(override) ? override : path.resolve(process.cwd(), ".tmp/ports", "server.port");
}

const host = process.env["HOST"] ?? "127.0.0.1";
// Dynamic port resolution: honor explicit PORT env if present, otherwise 0 for dynamic allocation
const requestedPort = process.env["PORT"] ? Number(process.env["PORT"]) : 0;

async function start() {
  const docWorkerPool = new DocWorkerPool();
  try {
    await docWorkerPool.start();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Fastify] DocWorkerPool initialization deferred or unavailable: ${msg}`);
  }

  const server = await buildServer({
    logger: true,
    docWorkerPool,
    serverHost: host,
  });

  const portFilePath = resolvePortFilePath();

  server.addHook("onClose", async () => {
    try {
      if (existsSync(portFilePath)) {
        rmSync(portFilePath, { force: true });
      }
    } catch {
      // Ignore cleanup error on exit
    }
    await docWorkerPool.stop();
  });

  try {
    await server.listen({ host, port: requestedPort });
    const address = server.server.address();
    const boundPort =
      typeof address === "object" && address !== null ? address.port : requestedPort;

    mkdirSync(path.dirname(portFilePath), { recursive: true });
    writeFileSync(portFilePath, String(boundPort), "utf8");

    console.log(`[Fastify] Server listening on http://${host}:${boundPort}`);
  } catch (error) {
    console.error("[Fastify] Failed to start server:", error);
    await docWorkerPool.stop();
    process.exitCode = 1;
  }
}

void start();

