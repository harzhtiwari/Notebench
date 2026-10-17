import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createSqliteDatabase, SqliteAccountRepository, SqliteSessionRepository } from "@notebench/infra-db";
import type { SqliteDatabaseInstance } from "@notebench/infra-db";
import { OwnerSetupService, FakePasscodeHasher } from "@notebench/domain-account";
import { SessionService } from "@notebench/domain-account";
import { buildServer } from "./app.js";

const TEST_DIR = resolve(`.tmp/test/test-server-rate-limit-${process.env["VITEST_WORKER_ID"] ?? "0"}`);
const PASSCODE = "a-very-secure-passcode-phrase-here";

async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 59) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      throw error;
    }
  }
}

describe("HTTP rate limiting (CodeQL missing-rate-limiting defense-in-depth)", () => {
  let app: FastifyInstance | undefined;
  let sqliteInstance: SqliteDatabaseInstance | undefined;
  let testDbPath: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry(TEST_DIR);
    }
    mkdirSync(TEST_DIR, { recursive: true });
    testDbPath = join(TEST_DIR, `rate-limit-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  }, 120_000);

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = undefined;
    }
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry(TEST_DIR);
      } catch {
        // Non-fatal if OS locks transitioning
      }
    }
  }, 120_000);

  async function boot(): Promise<void> {
    sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const accountRepo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const sessionRepo = new SqliteSessionRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: accountRepo, hasher });
    const sessionService = new SessionService({ accountRepository: accountRepo, sessionRepository: sessionRepo, hasher, now: Date.now });
    await ownerSetupService.setupOwner({ displayName: "Owner", passcode: PASSCODE });
    app = await buildServer({ ownerSetupService, sessionService, cookieSecret: "test-cookie-signing-secret-32-chars-ok", logger: false });
    await app.ready();
  }

  function server(): FastifyInstance {
    if (!app) throw new Error("Test server was not started");
    return app;
  }

  it("throttles rapid successful logins with 429 RATE_LIMITED + headers (RED)", async () => {
    await boot();
    const remoteAddress = "10.20.30.40";
    let lastStatus = 0;
    let lastBody = "";
    let lastHeaders: Record<string, unknown> = {};
    for (let i = 0; i < 26; i += 1) {
      const res = await server().inject({
        method: "POST",
        url: "/api/session/login",
        payload: { passcode: PASSCODE },
        remoteAddress,
      });
      lastStatus = res.statusCode;
      lastBody = res.body;
      lastHeaders = res.headers;
      if (i < 25) {
        expect(res.statusCode).toBe(200);
      }
    }
    expect(lastStatus).toBe(429);
    const body = JSON.parse(lastBody) as { error?: { code?: string } };
    expect(body.error?.code).toBe("RATE_LIMITED");
    expect(lastHeaders["x-ratelimit-limit"]).toBeDefined();
    expect(lastHeaders["retry-after"]).toBeDefined();
  }, 120_000);

  it("isolates limits per IP and ignores spoofed x-forwarded-for", async () => {
    await boot();
    const exhausted = "10.0.0.1";
    const fresh = "10.0.0.2";
    for (let i = 0; i < 25; i += 1) {
      const res = await server().inject({
        method: "POST",
        url: "/api/session/login",
        payload: { passcode: PASSCODE },
        remoteAddress: exhausted,
      });
      expect(res.statusCode).toBe(200);
    }
    const capped = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
      remoteAddress: exhausted,
    });
    expect(capped.statusCode).toBe(429);

    const otherIp = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
      remoteAddress: fresh,
    });
    expect(otherIp.statusCode).toBe(200);

    const spoofed = await server().inject({
      method: "POST",
      url: "/api/session/login",
      payload: { passcode: PASSCODE },
      remoteAddress: exhausted,
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(spoofed.statusCode).toBe(429);
  }, 120_000);

  it("throttles setup POSTs while leaving health probes unlimited", async () => {
    await boot();
    const remoteAddress = "10.0.1.1";
    for (let i = 0; i < 10; i += 1) {
      await server().inject({
        method: "POST",
        url: "/api/setup",
        payload: { displayName: "Someone" },
        remoteAddress,
      });
    }
    const capped = await server().inject({
      method: "POST",
      url: "/api/setup",
      payload: { displayName: "Someone" },
      remoteAddress,
    });
    expect(capped.statusCode).toBe(429);
    expect((JSON.parse(capped.body) as { error?: { code?: string } }).error?.code).toBe("RATE_LIMITED");

    const healthz = await server().inject({ method: "GET", url: "/healthz", remoteAddress });
    expect(healthz.statusCode).toBe(200);
  }, 120_000);

  it("throttles 404 probing without breaking healthz", async () => {
    await boot();
    const remoteAddress = "10.0.2.1";
    let lastStatus = 0;
    let lastBody = "";
    for (let i = 0; i < 51; i += 1) {
      const res = await server().inject({
        method: "GET",
        url: "/_next/stale-chunk-probe.js",
        headers: { accept: "application/json" },
        remoteAddress,
      });
      lastStatus = res.statusCode;
      lastBody = res.body;
    }
    expect(lastStatus).toBe(429);
    expect((JSON.parse(lastBody) as { error?: { code?: string } }).error?.code).toBe("RATE_LIMITED");
    const healthz = await server().inject({ method: "GET", url: "/healthz", remoteAddress });
    expect(healthz.statusCode).toBe(200);
  }, 120_000);
});
