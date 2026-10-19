import { describe, it, expect, vi } from "vitest";
import {
  filterNotebookSummaries,
  sortNotebookSummaries,
  DASHBOARD_COLUMNS_CONFIG,
  DASHBOARD_SORT_KEYS_CONFIG,
  DASHBOARD_METRICS_CONFIG,
  NotebookService,
} from "./index.js";
import type {
  Notebook,
  NotebookSummary,
  NotebookRepositoryPort,
  DuplicateNotebookInput,
} from "@notebench/contracts";

function makeSummary(overrides: Partial<NotebookSummary> & { id: string }): NotebookSummary {
  return {
    userId: "user-1",
    title: "Untitled",
    trashedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    sourcesCount: 0,
    artifactsCount: 0,
    storageBytes: 0,
    sourceFileNames: [],
    ...overrides,
  };
}

function makeMemoryRepo(seed: NotebookSummary[] = []): NotebookRepositoryPort & {
  store: Map<string, NotebookSummary>;
} {
  const store = new Map<string, NotebookSummary>(seed.map((s) => [s.id, s]));
  return {
    store,
    listSummaries: async (userId: string) =>
      store.values().filter((s) => s.userId === userId).toArray(),
    findById: async (id: string, userId: string) => {
      const found = store.get(id);
      if (found?.userId !== userId) return null;
      const { sourcesCount: _sc, artifactsCount: _ac, storageBytes: _sb, sourceFileNames: _sfn, ...rest } = found;
      return rest;
    },
    create: async (userId: string, input: { title: string }) => {
      const now = new Date().toISOString();
      const notebook: Notebook = {
        id: `nb-${store.size + 1}`,
        userId,
        title: input.title,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.set(notebook.id, makeSummary({ ...notebook }));
      return notebook;
    },
    update: async (id: string, userId: string, input: { title?: string }) => {
      const found = store.get(id);
      if (found?.userId !== userId) {
        throw new Error(`Notebook '${id}' not found`);
      }
      const updated: NotebookSummary = {
        ...found,
        title: input.title ?? found.title,
        updatedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      const { sourcesCount: _sc, artifactsCount: _ac, storageBytes: _sb, sourceFileNames: _sfn, ...rest } = updated;
      return rest;
    },
    delete: async (id: string) => {
      store.delete(id);
    },
    duplicate: async (sourceNotebookId: string, userId: string, input?: DuplicateNotebookInput) => {
      const original = store.get(sourceNotebookId);
      if (original?.userId !== userId) {
        throw new Error(`Notebook '${sourceNotebookId}' not found`);
      }
      const now = new Date().toISOString();
      const copy: NotebookSummary = {
        ...original,
        id: `nb-copy-${store.size + 1}`,
        title: input?.title ?? `Copy of ${original.title}`,
        createdAt: now,
        updatedAt: now,
        sourceFileNames: [...original.sourceFileNames],
      };
      store.set(copy.id, copy);
      const { sourcesCount: _sc, artifactsCount: _ac, storageBytes: _sb, sourceFileNames: _sfn, ...rest } = copy;
      return rest;
    },
    getMetrics: async (userId: string) => {
      const mine = store.values().filter((s) => s.userId === userId).toArray();
      return {
        storageUsedBytes: mine.reduce((sum, s) => sum + s.storageBytes, 0),
        storageSafeCapBytes: 5 * 1024 * 1024 * 1024,
        notebookCount: mine.length,
        sourceCount: mine.reduce((sum, s) => sum + s.sourcesCount, 0),
        artifactCount: mine.reduce((sum, s) => sum + s.artifactsCount, 0),
      };
    },
  };
}

describe("Notebook Domain Service & Configs (Ticket 05)", () => {
  const sampleNotebooks: NotebookSummary[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      title: "Quantum Computing Basics",
      trashedAt: null,
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-10T15:00:00.000Z",
      sourcesCount: 2,
      artifactsCount: 1,
      storageBytes: 2_048_000,
      sourceFileNames: ["Shor_Algorithm.pdf", "Notes.txt"],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
      title: "Biochemistry Digest",
      trashedAt: null,
      createdAt: "2026-10-05T08:00:00.000Z",
      updatedAt: "2026-10-11T12:00:00.000Z",
      sourcesCount: 4,
      artifactsCount: 3,
      storageBytes: 8_192_000,
      sourceFileNames: ["EnzymeKinetics.pdf", "Proteins.docx"],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "user-1",
      title: "Machine Learning Foundations",
      trashedAt: null,
      createdAt: "2026-10-02T12:00:00.000Z",
      updatedAt: "2026-10-08T09:00:00.000Z",
      sourcesCount: 1,
      artifactsCount: 0,
      storageBytes: 512_000,
      sourceFileNames: ["Backpropagation.pdf"],
    },
  ];

  describe("Declarative Reuse Configs", () => {
    it("defines exactly the 7 canonical dashboard list view columns (Decision 1.25)", () => {
      expect(DASHBOARD_COLUMNS_CONFIG).toHaveLength(7);
      const keys = DASHBOARD_COLUMNS_CONFIG.map((c) => c.id);
      expect(keys).toEqual([
        "emblem",
        "title",
        "sourcesCount",
        "artifactsCount",
        "storageFootprint",
        "lastUpdated",
        "actions",
      ]);
    });

    it("defines the 4 canonical dashboard sort keys (PRD B7)", () => {
      const sortIds = DASHBOARD_SORT_KEYS_CONFIG.map((s) => s.id);
      expect(sortIds).toEqual(["updated", "created", "title", "size"]);
    });

    it("defines the canonical metrics configuration (Decision 1.34)", () => {
      const metricIds = DASHBOARD_METRICS_CONFIG.map((m) => m.id);
      expect(metricIds).toEqual([
        "storageUsed",
        "notebookCount",
        "sourceCount",
        "artifactCount",
      ]);
    });
  });

  describe("filterNotebookSummaries (Decision 1.35)", () => {
    it("returns all notebooks when filter query is empty or blank", () => {
      expect(filterNotebookSummaries(sampleNotebooks, "")).toHaveLength(3);
      expect(filterNotebookSummaries(sampleNotebooks, ' '.repeat(3))).toHaveLength(3);
    });

    it("filters notebooks by title match (case-insensitive)", () => {
      const results = filterNotebookSummaries(sampleNotebooks, "quantum");
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Quantum Computing Basics");
    });

    it("filters notebooks by source filename match (case-insensitive)", () => {
      const results = filterNotebookSummaries(sampleNotebooks, "EnzymeKinetics");
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Biochemistry Digest");
    });

    it("returns empty array when neither title nor source filename matches", () => {
      const results = filterNotebookSummaries(sampleNotebooks, "NonExistentTerm");
      expect(results).toHaveLength(0);
    });
  });

  describe("sortNotebookSummaries (PRD B7)", () => {
    it("sorts by updated timestamp descending (default)", () => {
      const sorted = sortNotebookSummaries(sampleNotebooks, "updated", "desc");
      expect(sorted.map((n) => n.title)).toEqual([
        "Biochemistry Digest",
        "Quantum Computing Basics",
        "Machine Learning Foundations",
      ]);
    });

    it("sorts by updated timestamp ascending", () => {
      const sorted = sortNotebookSummaries(sampleNotebooks, "updated", "asc");
      expect(sorted.map((n) => n.title)).toEqual([
        "Machine Learning Foundations",
        "Quantum Computing Basics",
        "Biochemistry Digest",
      ]);
    });

    it("sorts by created timestamp", () => {
      const sorted = sortNotebookSummaries(sampleNotebooks, "created", "asc");
      expect(sorted.map((n) => n.title)).toEqual([
        "Quantum Computing Basics",
        "Machine Learning Foundations",
        "Biochemistry Digest",
      ]);
    });

    it("sorts alphabetically by title", () => {
      const sorted = sortNotebookSummaries(sampleNotebooks, "title", "asc");
      expect(sorted.map((n) => n.title)).toEqual([
        "Biochemistry Digest",
        "Machine Learning Foundations",
        "Quantum Computing Basics",
      ]);
    });

    it("sorts by size (storage footprint) descending", () => {
      const sorted = sortNotebookSummaries(sampleNotebooks, "size", "desc");
      expect(sorted.map((n) => n.title)).toEqual([
        "Biochemistry Digest",
        "Quantum Computing Basics",
        "Machine Learning Foundations",
      ]);
    });
  });

  describe("NotebookService", () => {
    const mockRepo = {
      listSummaries: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      getMetrics: vi.fn(),
    } satisfies NotebookRepositoryPort;

    it("creates a notebook with sanitized trimmed title", async () => {
      const service = new NotebookService(mockRepo);
      const createdNotebook: Notebook = {
        id: "new-id",
        userId: "user-1",
        title: "Clean Title",
        trashedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(mockRepo.create).mockResolvedValueOnce(createdNotebook);

      const result = await service.createNotebook("user-1", "   Clean Title   ");
      expect(mockRepo.create).toHaveBeenCalledWith("user-1", { title: "Clean Title" });
      expect(result.title).toBe("Clean Title");
    });

    it("rejects empty notebook title on creation and rename", async () => {
      const service = new NotebookService(mockRepo);
      await expect(service.createNotebook("user-1", ' '.repeat(3))).rejects.toThrow();
      await expect(service.renameNotebook("some-id", "user-1", "")).rejects.toThrow();
    });

    it("delegates duplicateNotebook to repository", async () => {
      const service = new NotebookService(mockRepo);
      const dup: Notebook = {
        id: "dup-id",
        userId: "user-1",
        title: "Copy of Quantum Computing Basics",
        trashedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(mockRepo.duplicate).mockResolvedValueOnce(dup);

      const result = await service.duplicateNotebook("11111111-1111-4111-8111-111111111111", "user-1");
      expect(mockRepo.duplicate).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "user-1",
        undefined
      );
      expect(result.id).toBe("dup-id");
    });
  });

  describe("NotebookService end-to-end over an in-memory repository (Ticket 05 §4)", () => {
    it("create returns an ID and the notebook appears in the list", async () => {
      const service = new NotebookService(makeMemoryRepo());
      const created = await service.createNotebook("user-1", "Field Notes");
      expect(created.id).toBeDefined();

      const listed = await service.listNotebooks("user-1");
      expect(listed.some((n) => n.id === created.id && n.title === "Field Notes")).toBe(true);
    });

    it("listNotebooks filters by title and source filename end to end", async () => {
      const service = new NotebookService(makeMemoryRepo(sampleNotebooks));
      const quantumResults = await service.listNotebooks("user-1", "quantum");
      expect(quantumResults.map((n) => n.title)).toEqual(["Quantum Computing Basics"]);
      const enzymeResults = await service.listNotebooks("user-1", "enzymekinetics");
      expect(enzymeResults.map((n) => n.title)).toEqual(["Biochemistry Digest"]);
      expect(await service.listNotebooks("user-1", "no-such-thing")).toEqual([]);
    });

    it("listNotebooks sorts by each key end to end", async () => {
      const service = new NotebookService(makeMemoryRepo(sampleNotebooks));
      const byTitleAsc = await service.listNotebooks("user-1", undefined, "title", "asc");
      expect(byTitleAsc.map((n) => n.title)).toEqual([
        "Biochemistry Digest",
        "Machine Learning Foundations",
        "Quantum Computing Basics",
      ]);
      const bySizeDesc = await service.listNotebooks("user-1", undefined, "size", "desc");
      expect(bySizeDesc.map((n) => n.title)).toEqual([
        "Biochemistry Digest",
        "Quantum Computing Basics",
        "Machine Learning Foundations",
      ]);
      const byCreatedAsc = await service.listNotebooks("user-1", undefined, "created", "asc");
      expect(byCreatedAsc.map((n) => n.title)).toEqual([
        "Quantum Computing Basics",
        "Machine Learning Foundations",
        "Biochemistry Digest",
      ]);
    });

    it("rename persists and the duplicate keeps counts with no shared rows", async () => {
      const repo = makeMemoryRepo(sampleNotebooks);
      const service = new NotebookService(repo);
      const renamed = await service.renameNotebook(
        "11111111-1111-4111-8111-111111111111",
        "user-1",
        "Quantum Revised"
      );
      expect(renamed.title).toBe("Quantum Revised");
      expect(repo.store.get("11111111-1111-4111-8111-111111111111")?.title).toBe("Quantum Revised");

      const original = repo.store.get("22222222-2222-4222-8222-222222222222");
      const copy = await service.duplicateNotebook("22222222-2222-4222-8222-222222222222", "user-1");
      expect(copy.id).not.toBe("22222222-2222-4222-8222-222222222222");
      const storedCopy = repo.store.get(copy.id);
      expect(storedCopy?.sourcesCount).toBe(original?.sourcesCount);
      expect(storedCopy?.sourceFileNames).not.toBe(original?.sourceFileNames);
      expect(storedCopy?.sourceFileNames).toEqual(original?.sourceFileNames);
    });
  });
});
