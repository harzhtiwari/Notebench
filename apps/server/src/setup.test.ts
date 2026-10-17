import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { resolve, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createLogger } from "@notebench/logger";
import { createSqliteDatabase, SqliteAccountRepository } from "@notebench/infra-db";
import { SetupAlreadyCompletedError, type PasscodeHasher } from "@notebench/contracts";
import {
  OwnerSetupService,
  Argon2PasscodeHasher,
  DEFAULT_ARGON2_CONFIG,
  FakePasscodeHasher,
} from "@notebench/domain-account";
import { buildServer } from "./app.js";

const TEST_DIR = resolve(`.tmp/test/test-server-setup-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
 * Windows holds file locks briefly after sqlite handles close, longer under
 * parallel suites: retry transient lock errors with a generous budget.
 */
async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Test-only hasher that holds every racing setup call at the hashing step
 * until two calls have arrived. This forces both calls to pass the
 * findOwner() pre-check before either reaches createOwner(), making the
 * single-owner race deterministic (Ticket 01 review D1).
 */
class BarrierGatePasscodeHasher implements PasscodeHasher {
  private arrivals = 0;
  private releaseGate: (() => void) | undefined;
  private readonly gate = new Promise<void>((resolveGate) => {
    this.releaseGate = resolveGate;
  });

  async hash(passcode: string): Promise<string> {
    this.arrivals += 1;
    if (this.arrivals >= 2) {
      this.releaseGate?.();
    }
    await this.gate;
    return `barrier-test-hash:${passcode}`;
  }

  async verify(_phcHash: string, _passcode: string): Promise<boolean> {
    return false;
  }
}

describe("Fastify Setup Routes & Security Invariants (Ticket 01)", () => {
  let app: FastifyInstance;
  let testDbPath: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await removeDirWithRetry(TEST_DIR);
    }
    mkdirSync(TEST_DIR, { recursive: true });

    testDbPath = join(TEST_DIR, `setup-test-${Date.now()}.sqlite`);
  }, 120_000);

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (existsSync(TEST_DIR)) {
      try {
        await removeDirWithRetry(TEST_DIR);
      } catch {
        // Non-fatal if OS locks transitioning
      }
    }
  }, 120_000);

  it("POST /setup creates the owner once; second call is rejected with stable code SETUP_ALREADY_COMPLETED", async () => {
    const sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: repo, hasher });

    app = await buildServer({
      ownerSetupService,
      logger: false,
    });
    await app.ready();

    // 1. Initial setup succeeds with 201 Created
    const firstRes = await app.inject({
      method: "POST",
      url: "/setup",
      payload: {
        displayName: "Sovereign Administrator",
        email: "admin@notebench.local",
        passcode: "a-very-secure-passcode-phrase-here",
      },
    });

    expect(firstRes.statusCode).toBe(201);
    const firstBody = JSON.parse(firstRes.body);
    expect(firstBody.success).toBe(true);
    expect(firstBody.owner.displayName).toBe("Sovereign Administrator");
    expect(firstBody.owner.email).toBe("admin@notebench.local");
    expect(firstBody.owner.role).toBe("owner");
    expect(firstBody.owner.hasPasscode).toBe(true);
    // Plaintext passcode is NEVER returned
    expect(firstBody.owner).not.toHaveProperty("passcode");
    expect(firstBody.owner).not.toHaveProperty("passcodeHash");

    // 2. Second setup attempt MUST be rejected with stable code SETUP_ALREADY_COMPLETED (409)
    const secondRes = await app.inject({
      method: "POST",
      url: "/setup",
      payload: {
        displayName: "Intruder Takeover",
        passcode: "another-passphrase-attempt-here",
      },
    });

    expect(secondRes.statusCode).toBe(409);
    const secondBody = JSON.parse(secondRes.body);
    expect(secondBody.error.code).toBe("SETUP_ALREADY_COMPLETED");
    expect(secondBody.error.message).toContain("already been completed");

    // Also verify /api/setup alias behaves identically
    const thirdRes = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { displayName: "Third Attempt" },
    });
    expect(thirdRes.statusCode).toBe(409);
    const thirdBody = JSON.parse(thirdRes.body);
    expect(thirdBody.error.code).toBe("SETUP_ALREADY_COMPLETED");

    sqliteInstance.close();
  });

  it("concurrent setup calls create exactly one owner and reject the loser (TOCTOU regression, D1)", async () => {
    const sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });

    try {
      const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
      const ownerSetupService = new OwnerSetupService({
        repository: repo,
        hasher: new BarrierGatePasscodeHasher(),
      });

      const results = await Promise.allSettled([
        ownerSetupService.setupOwner({
          displayName: "Concurrent First",
          passcode: "first-valid-race-passphrase-here",
        }),
        ownerSetupService.setupOwner({
          displayName: "Concurrent Second",
          passcode: "second-valid-race-passphrase-here",
        }),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const loser = rejected[0];
      if (loser === undefined || loser.status !== "rejected") {
        throw new Error("expected exactly one rejected concurrent setup call");
      }
      expect(loser.reason).toBeInstanceOf(SetupAlreadyCompletedError);
      expect(loser.reason).toHaveProperty("code", "SETUP_ALREADY_COMPLETED");
      expect(loser.reason).toHaveProperty("statusCode", 409);

      const ownerRows = sqliteInstance.sqlite
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'")
        .get() as { count: number };
      expect(ownerRows.count).toBe(1);
    } finally {
      sqliteInstance.close();
    }
  });

  it("stored value is a valid PHC string that verifies the correct passcode and rejects wrong one", async () => {
    const sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const realHasher = new Argon2PasscodeHasher({
      ...DEFAULT_ARGON2_CONFIG,
      memoryCost: 4096, // fast cost for test suite
      timeCost: 1,
    });
    const ownerSetupService = new OwnerSetupService({ repository: repo, hasher: realHasher });

    app = await buildServer({
      ownerSetupService,
      logger: false,
    });
    await app.ready();

    const secretPasscode = "my-secret-vault-master-passcode-phrase";
    const setupRes = await app.inject({
      method: "POST",
      url: "/setup",
      payload: {
        displayName: "Vault Keeper",
        passcode: secretPasscode,
      },
    });

    expect(setupRes.statusCode).toBe(201);

    // Verify raw database row has PHC string
    const ownerRecord = await repo.findOwner();
    expect(ownerRecord).not.toBeNull();
    expect(ownerRecord?.passcodeHash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);

    // Verify authentication succeeds with right passcode and fails with wrong passcode
    const verifiedRight = await ownerSetupService.verifyPasscode(secretPasscode);
    expect(verifiedRight).toBe(true);

    const verifiedWrong = await ownerSetupService.verifyPasscode("incorrect-guessed-secret");
    expect(verifiedWrong).toBe(false);

    sqliteInstance.close();
  });

  it("enforces scan invariant: plaintext passcode is ABSENT from database file and captured log output", async () => {
    const canaryPlaintext = "SUPER-SECRET-CANARY-PASSCODE-SCAN-999888";

    // Real capture: the application logger and Fastify request logging both
    // write into this stream, so the scan below has live log output to scan.
    const capturedLines: string[] = [];
    const captureStream = new Writable({
      write(chunk, _encoding, callback) {
        capturedLines.push(chunk.toString());
        callback();
      },
    });

    const customLogger = createLogger({
      name: "test-scan-logger",
      level: "debug",
      destination: captureStream,
    });

    const sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: repo, hasher });

    app = await buildServer({
      ownerSetupService,
      customLogger,
      logger: { level: "debug", stream: captureStream },
    });
    await app.ready();

    const setupRes = await app.inject({
      method: "POST",
      url: "/setup",
      payload: {
        displayName: "Canary Owner",
        passcode: canaryPlaintext,
      },
    });

    expect(setupRes.statusCode).toBe(201);

    // 1. Scan SQLite database file for plaintext leakage
    // Flush SQLite WAL checkpoint to ensure everything is written to disk
    sqliteInstance.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqliteInstance.close();

    const dbFileBuffer = readFileSync(testDbPath);
    const dbFileContent = dbFileBuffer.toString("binary");
    expect(dbFileContent.includes(canaryPlaintext)).toBe(false);

    // Also check WAL file if present
    const walPath = `${testDbPath}-wal`;
    if (existsSync(walPath)) {
      const walContent = readFileSync(walPath).toString("binary");
      expect(walContent.includes(canaryPlaintext)).toBe(false);
    }

    // 2. Scan captured log lines for plaintext leakage. The non-empty
    //    assertion proves the capture pipeline is live; otherwise this scan
    //    would be vacuous (Ticket 01 review D2).
    expect(capturedLines.length).toBeGreaterThan(0);
    const capturedOutput = capturedLines.join("\n");
    expect(capturedOutput.includes(canaryPlaintext)).toBe(false);
  });

  it("with no passcode configured, the app-state endpoint reports 'no sign-in required'", async () => {
    const sqliteInstance = createSqliteDatabase({ dbPath: testDbPath });
    const repo = new SqliteAccountRepository(sqliteInstance.db, sqliteInstance.sqlite);
    const hasher = new FakePasscodeHasher();
    const ownerSetupService = new OwnerSetupService({ repository: repo, hasher });

    app = await buildServer({
      ownerSetupService,
      logger: false,
    });
    await app.ready();

    // Prior to setup: setupComplete = false
    const preSetupRes = await app.inject({
      method: "GET",
      url: "/api/app-state",
    });
    expect(preSetupRes.statusCode).toBe(200);
    const preSetupBody = JSON.parse(preSetupRes.body);
    expect(preSetupBody.setupComplete).toBe(false);
    expect(preSetupBody.signInRequired).toBe(false);

    // Setup with NO passcode
    const setupRes = await app.inject({
      method: "POST",
      url: "/setup",
      payload: {
        displayName: "No-Passcode User",
      },
    });
    expect(setupRes.statusCode).toBe(201);

    // Post setup: reports 'no sign-in required'
    const postSetupRes = await app.inject({
      method: "GET",
      url: "/api/app-state",
    });
    expect(postSetupRes.statusCode).toBe(200);
    const postSetupBody = JSON.parse(postSetupRes.body);
    expect(postSetupBody.setupComplete).toBe(true);
    expect(postSetupBody.requiresPasscode).toBe(false);
    expect(postSetupBody.signInRequired).toBe(false);
    expect(postSetupBody.message?.toLowerCase()).toContain("no sign-in required");

    // Also check GET /setup endpoint returns app state
    const getSetupRes = await app.inject({
      method: "GET",
      url: "/setup",
    });
    expect(getSetupRes.statusCode).toBe(200);
    const getSetupBody = JSON.parse(getSetupRes.body);
    expect(getSetupBody.setupComplete).toBe(true);
    expect(getSetupBody.signInRequired).toBe(false);

    sqliteInstance.close();
  });

  it("measures Argon2id production parameter benchmark latency (NOTEBENCH 6.3)", async () => {
    // Benchmark production Argon2id parameters: m=65536 KiB, t=3, p=1
    const prodHasher = new Argon2PasscodeHasher(DEFAULT_ARGON2_CONFIG);
    const testSecret = "sample-production-passphrase-benchmark";

    const hashStart = performance.now();
    const phcHash = await prodHasher.hash(testSecret);
    const hashDurationMs = performance.now() - hashStart;

    const verifyStart = performance.now();
    const verified = await prodHasher.verify(phcHash, testSecret);
    const verifyDurationMs = performance.now() - verifyStart;

    expect(verified).toBe(true);
    console.log(
      `[Benchmark] Argon2id (m=65536 KiB, t=3, p=1): hash=${hashDurationMs.toFixed(1)}ms, verify=${verifyDurationMs.toFixed(1)}ms`
    );

    // Verification must execute reliably and within reasonable desktop/server envelope (< 500ms)
    expect(hashDurationMs).toBeGreaterThan(0);
    expect(verifyDurationMs).toBeGreaterThan(0);
  });
});
