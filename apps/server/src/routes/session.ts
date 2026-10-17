import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  ChangePasscodeInputSchema,
  LoginInputSchema,
  NotebookError,
  RateLimitedError,
  ValidationError,
  type NotebookErrorCode,
} from "@notebench/contracts";
import type { SessionService } from "@notebench/domain-account";
import {
  clearSessionCookies,
  resolveRequestSecurity,
  resolveRequestSession,
  setSessionCookie,
} from "../plugins/session.js";

export interface SessionRouteOptions {
  sessionService: SessionService;
}

/**
 * Fastify route plugin for passcode login, logout, active sessions and
 * passcode change (Ticket 02). The route layer only maps HTTP to the
 * SessionService domain functions.
 */
export const sessionRoutes: FastifyPluginAsync<SessionRouteOptions> = async (
  app,
  options
) => {
  const { sessionService } = options;

  const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await resolveRequestSession(request, sessionService);
    if (!session) {
      await reply.status(401).send({
        error: {
          code: "UNAUTHORIZED" satisfies NotebookErrorCode,
          message: "Valid session required. Sign in with the owner passcode.",
        },
      });
      return null;
    }
    return session;
  };

  const mapDomainError = async (reply: FastifyReply, err: unknown): Promise<void> => {
    if (err instanceof RateLimitedError) {
      await reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if (err instanceof ValidationError) {
      const setupRequired = err.details?.["reason"] === "setup_required";
      await reply.status(setupRequired ? 400 : 401).send({
        error: {
          code: (setupRequired ? "VALIDATION_ERROR" : "UNAUTHORIZED") satisfies NotebookErrorCode,
          message: err.message,
          details: err.details,
        },
      });
      return;
    }
    if (err instanceof NotebookError) {
      await reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    throw err;
  };

  const headerValue = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };

  app.post(
    "/api/session/login",
    {
      config: {
        rateLimit: { max: 25, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
    const parseResult = LoginInputSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "Invalid login parameters",
        },
      });
    }

    try {
      const outcome = await sessionService.login({
        passcode: parseResult.data.passcode,
        userAgent: headerValue(request.headers["user-agent"]),
        ipAddress: request.ip,
      });
      if (!outcome.sessionRequired) {
        return reply.status(200).send({ success: true, sessionRequired: false });
      }
      setSessionCookie(
        reply,
        outcome.rawToken,
        resolveRequestSecurity(request.protocol, request.headers["x-forwarded-proto"])
      );
      return reply.status(200).send({
        success: true,
        sessionRequired: true,
        session: { id: outcome.sessionId, expiresAt: outcome.expiresAt },
      });
    } catch (err: unknown) {
      await mapDomainError(reply, err);
    }
  });

  app.post("/api/session/logout", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) {
      return;
    }
    await sessionService.logout(session.record.id);
    clearSessionCookies(reply);
    return reply.status(200).send({ success: true });
  });

  app.post("/api/session/logout-everywhere", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) {
      return;
    }
    const revokedSessions = await sessionService.logoutEverywhere(session.record.userId);
    clearSessionCookies(reply);
    return reply.status(200).send({ success: true, revokedSessions });
  });

  app.get("/api/session/list", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) {
      return;
    }
    const sessions = await sessionService.listSessions(
      session.record.userId,
      session.record.id
    );
    return reply.status(200).send({ sessions });
  });

  app.post(
    "/api/session/change-passcode",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) {
      return;
    }
    const parseResult = ChangePasscodeInputSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR" satisfies NotebookErrorCode,
          message: "Invalid passcode change parameters",
        },
      });
    }

    try {
      const outcome = await sessionService.changePasscode({
        currentSessionId: session.record.id,
        currentPasscode: parseResult.data.currentPasscode,
        newPasscode: parseResult.data.newPasscode,
      });
      return reply.status(200).send({ success: true, ...outcome });
    } catch (err: unknown) {
      await mapDomainError(reply, err);
    }
  });
};
