import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import {
  createSqliteDatabase,
  SqliteAccountRepository,
  SqliteVaultKeyRepository,
} from "@notebench/infra-db";
import {
  EncryptedVault,
  resolveMasterKey,
  VAULT_CONSTANTS,
} from "@notebench/infra-vault";
import { createLogger } from "@notebench/logger";
import { buildServer } from "./app.js";

const TEST_DIR = path.resolve(`.tmp/test/test-server-vault-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

/**
Windows holds file locks briefly after sqlite handles close, longer under
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
const MASTER_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SAMPLE_KEY = "sk-proj-1234567890abcdef1234567890abcdef";

describe("Ticket 03: persistent vault wiring (server composition, RED)", () => {
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

  it("EncryptedVault over SQLite round-trips and deletes the ciphertext row", async () => {
    const dbPath = path.join(TEST_DIR, "vault-wired.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const accounts = new SqliteAccountRepository(db, sqlite);
      const owner = await accounts.createOwner({ displayName: "Owner" });

      const { masterKey } = resolveMasterKey({
        env: { [VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV]: MASTER_HEX },
        vaultDir: TEST_DIR,
      });
      const storage = new SqliteVaultKeyRepository(db, sqlite);
      const vault = new EncryptedVault(masterKey, storage);

      const { maskedKey } = await vault.setKey(
        "openai",
        "models.openaiKey",
        SAMPLE_KEY,
        owner.id
      );
      expect(maskedKey).toBe("sk-...cdef");

      const status = await vault.getStatus("openai", "models.openaiKey", owner.id);
      expect(status.configured).toBe(true);
      expect(status.maskedKey).toBe("sk-...cdef");

      const retrieved = await vault.getKey("openai", "models.openaiKey", owner.id);
      expect(retrieved).not.toBeNull();
      retrieved?.withSecret((plaintext) => {
        expect(plaintext).toBe(SAMPLE_KEY);
      });

      expect(await vault.deleteKey("openai", "models.openaiKey", owner.id)).toBe(true);
      expect(
        await vault.getStatus("openai", "models.openaiKey", owner.id)
      ).toEqual({ configured: false });
    } finally {
      close();
    }
  });

  it("logs an informational notice when the master key is auto-generated at boot (Decision 6.1)", async () => {
    // Fresh vault dir: no master.key and no NOTEBOOK_MASTER_KEY in the environment.
    // Snapshot/restore so this worker's environment is untouched afterwards.
    const previousMasterKeyEnv = process.env[VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV];
    Reflect.deleteProperty(process.env, VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV);
    const vaultDir = path.join(TEST_DIR, "boot-vault");

    const capturedLines: string[] = [];
    const captureStream = new Writable({
      write(chunk: unknown, _encoding, callback) {
        capturedLines.push(typeof chunk === "string" ? chunk : String(chunk));
        callback();
      },
    });
    const customLogger = createLogger({
      name: "boot-vault-logger",
      level: "info",
      destination: captureStream,
    });

    const sqliteInstance = createSqliteDatabase({ dbPath: path.join(TEST_DIR, "boot.sqlite") });
    let app: Awaited<ReturnType<typeof buildServer>> | undefined;
    try {
      app = await buildServer({
        vaultDir,
        customLogger,
        db: sqliteInstance,
        logger: false,
      });
      await app.ready();

      expect(existsSync(path.join(vaultDir, "master.key"))).toBe(true);

      // Parse the captured NDJSON lines and locate the generation notice.
      const entries = capturedLines
        .flatMap((chunk) => chunk.split("\n"))
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as { level?: number; msg?: string });

      const notice = entries.find((entry) =>
        entry.msg?.includes("Generated new 32-byte master encryption key")
      );
      expect(notice).toBeDefined();
      // The notice is informational (Decision 6.1), not a warning or error.
      expect(notice?.level).toBe(customLogger.levels.values["info"]);
    } finally {
      if (previousMasterKeyEnv === undefined) {
        Reflect.deleteProperty(process.env, VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV);
      } else {
        process.env[VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV] = previousMasterKeyEnv;
      }
      if (app) {
        await app.close();
      }
      sqliteInstance.close();
    }
  });
});
