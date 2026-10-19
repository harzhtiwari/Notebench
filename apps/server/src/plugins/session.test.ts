import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  COOKIE_KEY_FILE_NAME,
  isProtectedApiRoute,
  isRequestSecure,
  resolveCookieSecret,
} from "./session.js";

const TEST_DIR = path.resolve(`.tmp/test/test-session-plugin-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
Windows holds file locks briefly after handles close, longer under
parallel suites: retry transient lock errors with a generous budget.
*/
async function removeDirWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code ?? "";
      if (["EPERM", "EBUSY", "ENOTEMPTY"].includes(code) && attempt < 59) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      throw error;
    }
  }
}

describe("Session plugin helpers (Ticket 02)", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry();
    }
    mkdirSync(TEST_DIR, { recursive: true });
  }, 120_000);

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry();
      } catch {
        // Non-fatal if OS locks are briefly transitioning
      }
    }
  }, 120_000);

  it("prefers the explicit secret, then env, then the persisted vault file", () => {
    const vaultDir = path.join(TEST_DIR, "vault");
    const direct = resolveCookieSecret({
      cookieSecret: "direct-secret-32-characters-minimum-ok",
      vaultDir,
    });
    expect(direct).toEqual({
      secret: "direct-secret-32-characters-minimum-ok",
      source: "option",
    });
    expect(existsSync(path.join(vaultDir, COOKIE_KEY_FILE_NAME))).toBe(false);

    const fromEnv = resolveCookieSecret({
      vaultDir,
      env: { NOTEBOOK_COOKIE_SECRET: "env-secret-32-characters-minimum-ok!" },
    });
    expect(fromEnv.source).toBe("env");
  });

  it("generates and persists the vault cookie key so sessions survive restarts", () => {
    const vaultDir = path.join(TEST_DIR, "vault");
    const first = resolveCookieSecret({ vaultDir, env: {} });
    expect(first.source).toBe("generated");
    expect(first.secret.length).toBeGreaterThanOrEqual(32);

    const keyPath = path.join(vaultDir, COOKIE_KEY_FILE_NAME);
    expect(readFileSync(keyPath, "utf8").trim()).toBe(first.secret);

    const second = resolveCookieSecret({ vaultDir, env: {} });
    expect(second).toEqual({ secret: first.secret, source: "file" });
  });

  it("rejects short secrets instead of signing with weak key material", () => {
    expect(() =>
      resolveCookieSecret({ cookieSecret: "short", vaultDir: TEST_DIR, env: {} })
    ).toThrow(/at least 32 characters/);
  });

  it("protects every API route except setup, health and session routes", () => {
    for (const url of ["/api/notebooks", "/api/notebooks/abc", "/api/doctor", "/api/app-state-x"]) {
      expect(isProtectedApiRoute(url)).toBe(true);
    }
    for (const url of [
      "/setup",
      "/api/setup",
      "/api/app-state",
      "/api/session/login",
      "/api/session/list",
      "/healthz",
      "/livez",
      "/",
      "/login",
      "/static/app.js",
    ]) {
      expect(isProtectedApiRoute(url)).toBe(false);
    }
    expect(isProtectedApiRoute("/api/notebooks?page=2")).toBe(true);
  });

  it("detects HTTPS from the socket protocol or the forwarded proto header", () => {
    expect(isRequestSecure("https", undefined)).toBe(true);
    expect(isRequestSecure("http", "https")).toBe(true);
    expect(isRequestSecure("http", ["http", "https"])).toBe(false);
    expect(isRequestSecure("http", "http")).toBe(false);
    expect(isRequestSecure("http", undefined)).toBe(false);
  });
});
