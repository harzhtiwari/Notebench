import { defineConfig, devices } from "@playwright/test";
import { resolveE2EBaseUrl } from "./tools/dev/src/e2e-ports.js";

function resolveBaseUrl(): string {
  return resolveE2EBaseUrl(process.cwd(), process.env);
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
