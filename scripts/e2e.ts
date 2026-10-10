import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import getPort, { portNumbers } from "get-port";

async function runE2E() {
  const root = process.cwd();
  const portsDir = join(root, ".tmp", "ports");
  mkdirSync(portsDir, { recursive: true });

  const targetWeb = process.env["E2E_WEB_PORT"]
    ? Number(process.env["E2E_WEB_PORT"])
    : (process.env["WEB_PORT"] ? Number(process.env["WEB_PORT"]) : 3100);
  const targetServer = process.env["E2E_SERVER_PORT"]
    ? Number(process.env["E2E_SERVER_PORT"])
    : (process.env["SERVER_PORT"] ? Number(process.env["SERVER_PORT"]) : 4100);

  const webPort = await getPort({
    port: portNumbers(targetWeb, targetWeb + 100),
    host: "127.0.0.1",
  });
  const serverPort = await getPort({
    port: portNumbers(targetServer, targetServer + 100),
    host: "127.0.0.1",
  });

  const webPortFile = join(portsDir, "e2e-web.port");
  const serverPortFile = join(portsDir, "e2e-server.port");

  writeFileSync(webPortFile, String(webPort));
  writeFileSync(serverPortFile, String(serverPort));

  console.log(`\n🧪 Launching E2E Environment on ports ${webPort} (web) & ${serverPort} (server)...`);

  const playwright = spawn("npx", ["playwright", "test"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      CI: "true",
      PLAYWRIGHT_TEST_BASE_URL: `http://127.0.0.1:${webPort}`,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
      E2E_SERVER_URL: `http://127.0.0.1:${serverPort}`,
    },
  });

  const cleanup = () => {
    for (const f of [webPortFile, serverPortFile]) {
      if (existsSync(f)) {
        try {
          rmSync(f, { force: true });
        } catch {
          // Ignore removal errors on exit
        }
      }
    }
  };

  playwright.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    cleanup();
    playwright.kill();
    process.exit(1);
  });
}

runE2E().catch((err) => {
  console.error("E2E test orchestrator failed:", err);
  process.exit(1);
});
