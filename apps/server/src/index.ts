import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildServer } from "./app.js";
import { DocWorkerPool } from "@notebook/infra-doc-worker";

const host = process.env["HOST"] ?? "127.0.0.1";
// Dynamic port resolution: honor explicit PORT env if present, otherwise 0 for dynamic allocation
const requestedPort = process.env["PORT"] ? Number(process.env["PORT"]) : 0;

async function start() {
  const docWorkerPool = new DocWorkerPool();
  try {
    await docWorkerPool.start();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Fastify] DocWorkerPool initialization deferred or unavailable: ${msg}`);
  }

  const server = await buildServer({
    logger: true,
    docWorkerPool,
    serverHost: host,
  });

  const portsDir = resolve(process.cwd(), ".tmp/ports");
  const portFilePath = resolve(portsDir, "server.port");

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

    mkdirSync(portsDir, { recursive: true });
    writeFileSync(portFilePath, String(boundPort), "utf-8");

    console.log(`[Fastify] Server listening on http://${host}:${boundPort}`);
  } catch (err) {
    console.error("[Fastify] Failed to start server:", err);
    await docWorkerPool.stop();
    process.exit(1);
  }
}

void start();

