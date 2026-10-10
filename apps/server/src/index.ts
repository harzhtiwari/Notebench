import { buildServer } from "./app.js";

const host = process.env["HOST"] ?? "127.0.0.1";
const port = Number(process.env["PORT"] ?? 3001);

async function start() {
  const server = await buildServer({
    logger: true,
  });

  try {
    await server.listen({ host, port });
    console.log(`[Fastify] Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error("[Fastify] Failed to start server:", err);
    process.exit(1);
  }
}

void start();
