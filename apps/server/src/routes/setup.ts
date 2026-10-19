import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  SetupOwnerInputSchema,
  NotebookError,
  SetupAlreadyCompletedError,
  ValidationError,
  type NotebookErrorCode,
} from "@notebench/contracts";
import type { OwnerSetupService } from "@notebench/domain-account";

export interface SetupRouteOptions {
  ownerSetupService: OwnerSetupService;
}

/**
Fastify route plugin handling first-run owner onboarding and app-state status probe.
*/
export const setupRoutes: FastifyPluginAsync<SetupRouteOptions> = (app, options) => {
  const { ownerSetupService } = options;

  const handleSetupPost = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    // Validate request body
    const parseResult = SetupOwnerInputSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "Invalid setup parameters",
          details: { issues: parseResult.error.issues },
        },
      });
    }

    try {
      const result = await ownerSetupService.setupOwner(parseResult.data);
      return await reply.status(201).send({
        success: true,
        owner: result.owner,
      });
    } catch (error: unknown) {
      if (error instanceof SetupAlreadyCompletedError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error instanceof ValidationError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      if (error instanceof NotebookError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      request.log.error(error, "Unexpected error occurred during owner setup");
      return reply.status(500).send({
        error: {
          code: "INVARIANCE_VIOLATION" satisfies NotebookErrorCode,
          message: "An internal server error occurred during setup",
        },
      });
    }
  };

  const handleStateGet = async () => {
    return ownerSetupService.getAppState();
  };

  // 1. Root /setup endpoint mapping
  app.post(
    "/setup",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    handleSetupPost
  );
  app.get("/setup", handleStateGet);

  // 2. Canonical /api/setup endpoint mapping
  app.post(
    "/api/setup",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    handleSetupPost
  );
  app.get("/api/setup", handleStateGet);

  // 3. Application State endpoint (/api/app-state)
  app.get("/api/app-state", handleStateGet);

  return Promise.resolve();
};
