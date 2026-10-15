import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  COOKIE_KEY_FILE_NAME,
  isProtectedApiRoute,
  resolveCookieSecret,
  resolveRequestSecurity,
} from "./session.js";

const TEST_DIR = resolve(".tmp/test-session-plugin");

describe("Session plugin helpers (Ticket 02)", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("prefers the explicit secret, then env, then the persisted vault file", () => {
    const vaultDir = join(TEST_DIR, "vault");
    const direct = resolveCookieSecret({
      cookieSecret: "direct-secret-32-characters-minimum-ok",
      vaultDir,
    });
    expect(direct).toEqual({
      secret: "direct-secret-32-characters-minimum-ok",
      source: "option",
    });
    expect(existsSync(join(vaultDir, COOKIE_KEY_FILE_NAME))).toBe(false);

    const fromEnv = resolveCookieSecret({
      vaultDir,
      env: { NOTEBOOK_COOKIE_SECRET: "env-secret-32-characters-minimum-ok!" },
    });
    expect(fromEnv.source).toBe("env");
  });

  it("generates and persists the vault cookie key so sessions survive restarts", () => {
    const vaultDir = join(TEST_DIR, "vault");
    const first = resolveCookieSecret({ vaultDir, env: {} });
    expect(first.source).toBe("generated");
    expect(first.secret.length).toBeGreaterThanOrEqual(32);

    const keyPath = join(vaultDir, COOKIE_KEY_FILE_NAME);
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
    expect(resolveRequestSecurity("https", undefined)).toBe(true);
    expect(resolveRequestSecurity("http", "https")).toBe(true);
    expect(resolveRequestSecurity("http", ["http", "https"])).toBe(false);
    expect(resolveRequestSecurity("http", "http")).toBe(false);
    expect(resolveRequestSecurity("http", undefined)).toBe(false);
  });
});
