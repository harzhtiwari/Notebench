import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function resolveBaseUrl(): string {
  if (process.env["PLAYWRIGHT_TEST_BASE_URL"]) return process.env["PLAYWRIGHT_TEST_BASE_URL"];
  if (process.env["PLAYWRIGHT_BASE_URL"]) return process.env["PLAYWRIGHT_BASE_URL"];

  const e2ePortFile = join(process.cwd(), ".tmp", "ports", "e2e-web.port");
  if (existsSync(e2ePortFile)) {
    const port = readFileSync(e2ePortFile, "utf-8").trim();
    if (port) return `http://127.0.0.1:${port}`;
  }

  const webPortFile = join(process.cwd(), ".tmp", "ports", "web.port");
  if (existsSync(webPortFile)) {
    const port = readFileSync(webPortFile, "utf-8").trim();
    if (port) return `http://127.0.0.1:${port}`;
  }

  const port = process.env["PORT"] || "3100";
  return `http://127.0.0.1:${port}`;
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: resolveBaseUrl(),
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
