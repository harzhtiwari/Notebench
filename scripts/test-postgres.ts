import { spawn, spawnSync } from "node:child_process";
import getPort, { portNumbers } from "get-port";

/**
 * Ticket 28 — PostgreSQL integration test orchestrator.
 *
 * Starts a throwaway pgvector container (`pgvector/pgvector:pg17`), points
 * `POSTGRES_URL` at it, and runs the live-Postgres suites under
 * `packages/infra-db/test/` (factory, migrator, dialect parity, pgvector
 * top-5 parity). The container is removed on exit.
 *
 * When `POSTGRES_URL` is already set (CI service container, or a local
 * server), the script skips Docker entirely and runs the suites against that
 * URL — the same mode the tests document for their skip/run gate.
 */

const IMAGE = "pgvector/pgvector:pg17";
const CONTAINER_PREFIX = "notebench-pg28";
const READY_TIMEOUT_MS = 120_000;

function run(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ?? process.env,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeStaleContainers(): Promise<void> {
  const listed = spawnSync(
    "docker",
    ["ps", "-aq", "--filter", `name=${CONTAINER_PREFIX}`],
    { encoding: "utf8", shell: true }
  );
  const ids = (listed.stdout ?? "").split(/\s+/).filter(Boolean);
  if (ids.length > 0) {
    await run("docker", ["rm", "-f", ...ids]);
  }
}

async function main(): Promise<void> {
  const existingUrl = process.env["POSTGRES_URL"];

  if (existingUrl) {
    console.log(
      "[test:postgres] POSTGRES_URL is already set — running the suites against it (service container mode)."
    );
    process.exit(
      await run("pnpm", ["exec", "vitest", "run", "packages/infra-db/test"])
    );
  }

  const dockerInfo = spawnSync("docker", ["info"], { stdio: "ignore", shell: true });
  if (dockerInfo.status !== 0) {
    console.error(
      "[test:postgres] Docker daemon is not available. Start Docker Desktop (or set POSTGRES_URL to an existing server) and retry."
    );
    process.exit(1);
  }

  await removeStaleContainers();

  const port = await getPort({
    port: portNumbers(54330, 54430),
    host: "127.0.0.1",
  });
  const name = `${CONTAINER_PREFIX}-${process.pid}`;
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;

  console.log(`[test:postgres] starting ${IMAGE} as ${name} on 127.0.0.1:${port}...`);
  const started = await run("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-p",
    `127.0.0.1:${port}:5432`,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    IMAGE,
  ]);
  if (started !== 0) {
    console.error("[test:postgres] docker run failed.");
    process.exit(started);
  }

  let cleanedUp = false;
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    console.log(`[test:postgres] removing container ${name}...`);
    await run("docker", ["rm", "-f", name]);
  };
  process.on("SIGINT", () => {
    void cleanup().then(() => process.exit(130));
  });

  try {
    let ready = false;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!ready && Date.now() < deadline) {
      ready =
        spawnSync(
          "docker",
          ["exec", name, "pg_isready", "-U", "postgres", "-d", "postgres"],
          { stdio: "ignore", shell: true }
        ).status === 0;
      if (!ready) await sleep(1000);
    }
    if (!ready) {
      throw new Error(
        `Postgres container did not become ready within ${READY_TIMEOUT_MS / 1000}s`
      );
    }

    console.log("[test:postgres] Postgres ready — running integration suites...");
    const code = await run(
      "pnpm",
      ["exec", "vitest", "run", "packages/infra-db/test"],
      { ...process.env, POSTGRES_URL: url }
    );
    await cleanup();
    process.exit(code);
  } catch (error) {
    console.error("[test:postgres]", error);
    await cleanup();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[test:postgres] orchestrator failed:", error);
  process.exit(1);
});
