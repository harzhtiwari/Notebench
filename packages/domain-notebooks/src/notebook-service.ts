import {
  type Notebook,
  type NotebookSummary,
  type NotebookRepositoryPort,
  type DuplicateNotebookInput,
  type DashboardMetrics,
  ValidationError,
} from "@notebook/contracts";
import { type DashboardSortKey } from "./configs.js";
import { filterNotebookSummaries, sortNotebookSummaries } from "./filter-and-sort.js";

export class NotebookService {
  private readonly repo: NotebookRepositoryPort;

  constructor(repo: NotebookRepositoryPort) {
    this.repo = repo;
  }

  public async listNotebooks(
    userId: string,
    filterQuery?: string,
    sortKey?: DashboardSortKey,
    sortDirection?: "asc" | "desc"
  ): Promise<NotebookSummary[]> {
    const rawSummaries = await this.repo.listSummaries(userId);
    let result = rawSummaries;

    if (filterQuery !== undefined && filterQuery.trim().length > 0) {
      result = filterNotebookSummaries(result, filterQuery);
    }

    if (sortKey !== undefined) {
      result = sortNotebookSummaries(result, sortKey, sortDirection);
    }

    return result;
  }

  public async getNotebook(id: string, userId: string): Promise<Notebook | null> {
    return this.repo.findById(id, userId);
  }

  public async createNotebook(userId: string, title: string): Promise<Notebook> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new ValidationError("Notebook title cannot be empty");
    }

    return this.repo.create(userId, { title: trimmedTitle });
  }

  public async renameNotebook(
    id: string,
    userId: string,
    newTitle: string
  ): Promise<Notebook> {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      throw new ValidationError("Notebook title cannot be empty");
    }

    return this.repo.update(id, userId, { title: trimmedTitle });
  }

  public async duplicateNotebook(
    sourceNotebookId: string,
    userId: string,
    input?: DuplicateNotebookInput
  ): Promise<Notebook> {
    return this.repo.duplicate(sourceNotebookId, userId, input);
  }

  public async getMetrics(userId: string): Promise<DashboardMetrics> {
    return this.repo.getMetrics(userId);
  }

  public async deleteNotebook(id: string, userId: string): Promise<void> {
    return this.repo.delete(id, userId);
  }
}
