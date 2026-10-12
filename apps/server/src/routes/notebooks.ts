import type { FastifyPluginAsync } from "fastify";
import {
  CreateNotebookInputSchema,
  UpdateNotebookInputSchema,
  DuplicateNotebookInputSchema,
  NotebookError,
  NotFoundError,
  ValidationError,
  type NotebookRepositoryPort,
} from "@notebook/contracts";
import { NotebookService, type DashboardSortKey } from "@notebook/domain-notebooks";

export interface NotebooksRoutesOptions {
  notebookService?: NotebookService | undefined;
  notebookRepo?: NotebookRepositoryPort | undefined;
  defaultUserId?: string | undefined;
}

export const notebooksRoutes: FastifyPluginAsync<NotebooksRoutesOptions> = async (
  app,
  options
) => {
  const defaultUserId =
    options.defaultUserId ?? "11111111-1111-4111-8111-111111111111";

  const getService = (): NotebookService => {
    if (options.notebookService) {
      return options.notebookService;
    }
    if (options.notebookRepo) {
      return new NotebookService(options.notebookRepo);
    }
    throw new Error("NotebooksRoutes requires either notebookService or notebookRepo");
  };

  const resolveUserId = (headerVal: unknown): string => {
    if (typeof headerVal === "string" && headerVal.trim().length > 0) {
      return headerVal.trim();
    }
    return defaultUserId;
  };

  // Metrics endpoint (must be defined before /:id)
  app.get("/api/notebooks/metrics", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const service = getService();
      const metrics = await service.getMetrics(userId);
      return reply.status(200).send({ metrics });
    } catch (err) {
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // List notebooks
  app.get("/api/notebooks", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const query = request.query as {
        filter?: string;
        sort?: DashboardSortKey;
        dir?: "asc" | "desc";
      };

      const service = getService();
      const notebooks = await service.listNotebooks(
        userId,
        query.filter,
        query.sort,
        query.dir
      );
      return reply.status(200).send({ notebooks });
    } catch (err) {
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // Create notebook
  app.post("/api/notebooks", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const bodyResult = CreateNotebookInputSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: bodyResult.error.issues[0]?.message ?? "Invalid notebook input",
          },
        });
      }

      const service = getService();
      const notebook = await service.createNotebook(userId, bodyResult.data.title);
      return reply.status(201).send({ notebook });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // Get single notebook
  app.get("/api/notebooks/:id", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const { id } = request.params as { id: string };
      const service = getService();
      const notebook = await service.getNotebook(id, userId);
      if (!notebook) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: `Notebook '${id}' not found` },
        });
      }
      return reply.status(200).send({ notebook });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // Rename or update notebook
  app.patch("/api/notebooks/:id", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const { id } = request.params as { id: string };
      const bodyResult = UpdateNotebookInputSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: bodyResult.error.issues[0]?.message ?? "Invalid update input",
          },
        });
      }

      const service = getService();
      if (bodyResult.data.title !== undefined) {
        const notebook = await service.renameNotebook(
          id,
          userId,
          bodyResult.data.title
        );
        return reply.status(200).send({ notebook });
      }

      // If updating other fields like trashedAt
      const notebook = await options.notebookRepo!.update(id, userId, bodyResult.data);
      return reply.status(200).send({ notebook });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof ValidationError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // Duplicate notebook (B4)
  app.post("/api/notebooks/:id/duplicate", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const { id } = request.params as { id: string };
      const bodyResult = DuplicateNotebookInputSchema.safeParse(request.body ?? {});
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: bodyResult.error.issues[0]?.message ?? "Invalid duplicate input",
          },
        });
      }

      const service = getService();
      const duplicated = await service.duplicateNotebook(
        id,
        userId,
        bodyResult.data
      );
      return reply.status(201).send({ notebook: duplicated });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // Delete notebook
  app.delete("/api/notebooks/:id", async (request, reply) => {
    try {
      const userId = resolveUserId(request.headers["x-user-id"]);
      const { id } = request.params as { id: string };
      const service = getService();
      await service.deleteNotebook(id, userId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof NotebookError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
};
