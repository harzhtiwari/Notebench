import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sqliteSchema } from "../src/schema/index.js";
import { initializeSqliteSchema } from "../src/sqlite/notebook-repository.js";
import {
  SqliteVaultKeyRepository,
  type VaultKeyRecord,
  type VaultKeyStorage,
} from "../src/sqlite/vault-key-repository.js";
import { initializePgSchema } from "../src/pg/bootstrap.js";
import { createPgDatabase } from "../src/pg/connection.js";
import { PgVaultKeyRepository } from "../src/pg/vault-key-repository.js";
import { runPgMigrations } from "../src/migrator/runner.js";
import { createFreshPgDatabase, pgIntegrationSkipReason } from "./pg-harness.js";

/**
 * Ticket 28 — ONE dialect-parameterised repository contract suite.
 *
 * The exact same test body runs against the SQLite and the PostgreSQL
 * implementation of the smallest stable repository port in `infra-db`
 * (`VaultKeyStorage`, shape-matched to `@notebench/infra-vault`'s
 * `VaultStorage` — infra packages cannot import each other, guard check 11).
 *
 * The SQLite dialect always runs. The PostgreSQL dialect skips cleanly when
 * `POSTGRES_URL` is unset; `pnpm test:postgres` starts a pgvector container
 * and sets it.
 */

interface DialectHarness {
  storage: VaultKeyStorage;
  /** Creates FK prerequisite rows (`users`) for the given ids. */
  ensureUsers: (userIds: string[]) => Promise<void>;
  dispose: () => Promise<void>;
}

type DialectFactory = () => Promise<DialectHarness>;
type DescribeImpl = (name: string, factory: () => void) => void;

function runVaultKeyContractSuite(
  dialectName: string,
  createHarness: DialectFactory,
  describeImpl: DescribeImpl,
  titleSuffix = ""
): void {
  describeImpl(`VaultKeyStorage contract (${dialectName})${titleSuffix}`, () => {
    let harness: DialectHarness;
    const userId = randomUUID();

    function makeRecord(overrides: Partial<VaultKeyRecord> = {}): VaultKeyRecord {
      const keyId = overrides.keyId ?? randomUUID();
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        userId,
        provider: "openai",
        keyId,
        envelope: {
          schemaVersion: 1,
          provider: "openai",
          keyId,
          ciphertext: "ciphertext-v1",
          iv: "iv-16-bytes",
          tag: "tag-16-bytes",
        },
        maskedKey: "sk-…1234",
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    beforeAll(async () => {
      harness = await createHarness();
      await harness.ensureUsers([userId]);
    });

    afterAll(async () => {
      await harness?.dispose();
    });

    it("round-trips a saved key through get without losing the envelope", async () => {
      const item = makeRecord();

      await harness.storage.save(item);
      const loaded = await harness.storage.get(item.provider, item.keyId, item.userId);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(item.id);
      expect(loaded?.provider).toBe(item.provider);
      expect(loaded?.keyId).toBe(item.keyId);
      expect(loaded?.envelope).toEqual(item.envelope);
      expect(loaded?.maskedKey).toBe(item.maskedKey);
      expect(Date.parse(loaded?.createdAt ?? "")).toBe(Date.parse(item.createdAt));
    });

    it("replaces the row for the same (provider, keyId, user) instead of duplicating it", async () => {
      const item = makeRecord();
      await harness.storage.save(item);

      const replacement: VaultKeyRecord = {
        ...item,
        id: randomUUID(),
        envelope: { ...item.envelope, ciphertext: "ciphertext-v2" },
        updatedAt: new Date().toISOString(),
      };
      await harness.storage.save(replacement);

      const matches = (await harness.storage.list(userId)).filter(
        (candidate) =>
          candidate.provider === item.provider && candidate.keyId === item.keyId
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.envelope.ciphertext).toBe("ciphertext-v2");
    });

    it("returns null when the key does not exist", async () => {
      const loaded = await harness.storage.get("openai", randomUUID(), userId);
      expect(loaded).toBeNull();
    });

    it("deletes the addressed key and reports whether a row was removed", async () => {
      const item = makeRecord();
      await harness.storage.save(item);

      expect(await harness.storage.delete(item.provider, item.keyId, item.userId)).toBe(true);
      expect(await harness.storage.get(item.provider, item.keyId, item.userId)).toBeNull();
      expect(await harness.storage.delete(item.provider, item.keyId, item.userId)).toBe(false);
    });

    it("lists only the keys owned by the given user", async () => {
      // Dedicated users keep this assertion independent of the other tests.
      const listUser = randomUUID();
      const otherListUser = randomUUID();
      await harness.ensureUsers([listUser, otherListUser]);

      const mine = makeRecord({ keyId: randomUUID(), userId: listUser, provider: "anthropic" });
      const theirs = makeRecord({
        keyId: randomUUID(),
        userId: otherListUser,
        provider: "google",
      });
      await harness.storage.save(mine);
      await harness.storage.save(theirs);

      const listed = await harness.storage.list(listUser);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(mine.id);

      const listedOthers = await harness.storage.list(otherListUser);
      expect(listedOthers).toHaveLength(1);
      expect(listedOthers[0]?.id).toBe(theirs.id);
    });
  });
}

// --- SQLite dialect: always runs, in-memory, no external services ----------
runVaultKeyContractSuite(
  "sqlite",
  async () => {
    const sqlite = new Database(":memory:");
    // Mirror production bootstrap: users (FK target) exists before provider_keys.
    initializeSqliteSchema(sqlite);
    const db = drizzle(sqlite, { schema: sqliteSchema });
    return {
      storage: new SqliteVaultKeyRepository(db, sqlite),
      ensureUsers: async (userIds) => {
        const statement = sqlite.prepare(
          "INSERT INTO users (id, role, created_at, updated_at) VALUES (?, 'owner', ?, ?)"
        );
        const now = new Date().toISOString();
        for (const id of userIds) {
          statement.run(id, now, now);
        }
      },
      dispose: async () => {
        sqlite.close();
      },
    };
  },
  describe
);

// --- PostgreSQL dialect: needs POSTGRES_URL (starts via pnpm test:postgres) -
const skipReason = pgIntegrationSkipReason();
const skipSuffix = skipReason
  ? " [skipped: POSTGRES_URL not set — run pnpm test:postgres]"
  : "";
if (skipReason) {
  console.warn(`[pg-integration] VaultKeyStorage postgres dialect skipped: ${skipReason}`);
}

runVaultKeyContractSuite(
  "postgres",
  async () => {
    const fresh = await createFreshPgDatabase();
    const pgDb = createPgDatabase({ connectionString: fresh.url });
    try {
      await runPgMigrations({
        pool: pgDb.pool,
        migrationFn: initializePgSchema,
      });
    } catch (error) {
      await pgDb.close();
      await fresh.close();
      throw error;
    }
    return {
      storage: new PgVaultKeyRepository(pgDb.db),
      ensureUsers: async (userIds) => {
        for (const id of userIds) {
          await pgDb.pool.query(
            "INSERT INTO users (id, role, created_at, updated_at) VALUES ($1, 'owner', now(), now())",
            [id]
          );
        }
      },
      dispose: async () => {
        await pgDb.close();
        await fresh.close();
      },
    };
  },
  skipReason ? describe.skip : describe,
  skipSuffix
);
