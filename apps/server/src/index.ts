import { buildServer } from "./app.js";
import { DocWorkerPool } from "@notebook/infra-doc-worker";

const host = process.env["HOST"] ?? "127.0.0.1";
const port = Number(process.env["PORT"] ?? 3001);

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
  });

  server.addHook("onClose", async () => {
    await docWorkerPool.stop();
  });

  try {
    await server.listen({ host, port });
    console.log(`[Fastify] Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error("[Fastify] Failed to start server:", err);
    await docWorkerPool.stop();
    process.exit(1);
  }
}

void start();

