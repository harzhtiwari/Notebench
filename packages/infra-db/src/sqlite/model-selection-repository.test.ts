import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createSqliteDatabase } from "./connection.js";
import { SqliteAccountRepository } from "./account-repository.js";
import {
  SqliteModelSelectionRepository,
  migrateModelSelectionsTable,
} from "./model-selection-repository.js";

const TEST_DIR = path.resolve(`.tmp/test/test-model-selection-${process.env["VITEST_WORKER_ID"] ?? "0"}`);

function randomModelId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

async function removeDirWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code ?? "";
      if (["EPERM", "EBUSY", "ENOTEMPTY"].includes(code) && attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw error;
    }
  }
}

describe("SqliteModelSelectionRepository (Ticket 04 RED, D6/D7)", () => {
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

  it("chat and embedding models persist independently", async () => {
    const dbPath = path.join(TEST_DIR, "selections.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const owner = await new SqliteAccountRepository(db, sqlite).createOwner({ displayName: "Owner" });
      migrateModelSelectionsTable(sqlite);
      const repo = new SqliteModelSelectionRepository(db, sqlite);
      const chatId = randomModelId("chat-model");
      const embeddingId = randomModelId("embed-model");
      await repo.save({ userId: owner.id, kind: "chat", provider: "openai", modelId: chatId });
      await repo.save({ userId: owner.id, kind: "embedding", provider: "openai", modelId: embeddingId });
      const storedChat = await repo.get(owner.id, "chat");
      const storedEmbedding = await repo.get(owner.id, "embedding");
      expect(storedChat?.modelId).toBe(chatId);
      expect(storedEmbedding?.modelId).toBe(embeddingId);
    } finally {
      close();
    }
  });

  it("updating the chat model leaves the embedding model untouched", async () => {
    const dbPath = path.join(TEST_DIR, "selections-update.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const owner = await new SqliteAccountRepository(db, sqlite).createOwner({ displayName: "Owner" });
      migrateModelSelectionsTable(sqlite);
      const repo = new SqliteModelSelectionRepository(db, sqlite);
      const embeddingId = randomModelId("embed-model");
      await repo.save({ userId: owner.id, kind: "chat", provider: "openai", modelId: randomModelId("old-chat") });
      await repo.save({ userId: owner.id, kind: "embedding", provider: "openai", modelId: embeddingId });
      const nextChat = randomModelId("new-chat");
      await repo.save({ userId: owner.id, kind: "chat", provider: "anthropic", modelId: nextChat });
      const updatedChat = await repo.get(owner.id, "chat");
      expect(updatedChat?.modelId).toBe(nextChat);
      expect(updatedChat?.provider).toBe("anthropic");
      const updatedEmbedding = await repo.get(owner.id, "embedding");
      expect(updatedEmbedding?.modelId).toBe(embeddingId);
    } finally {
      close();
    }
  });

  it("custom typed model IDs persist verbatim", async () => {
    const dbPath = path.join(TEST_DIR, "selections-custom.sqlite");
    const { db, sqlite, close } = createSqliteDatabase({ dbPath });
    try {
      const owner = await new SqliteAccountRepository(db, sqlite).createOwner({ displayName: "Owner" });
      migrateModelSelectionsTable(sqlite);
      const repo = new SqliteModelSelectionRepository(db, sqlite);
      const customId = `my-org-custom-${randomBytes(4).toString("hex")}/v2`;
      await repo.save({ userId: owner.id, kind: "chat", provider: "openai-compatible", modelId: customId });
      const storedCustom = await repo.get(owner.id, "chat");
      expect(storedCustom?.modelId).toBe(customId);
    } finally {
      close();
    }
  });
});
