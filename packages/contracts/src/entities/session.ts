import { z } from "zod";

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  lastActiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionInputSchema = z.object({
  userId: z.string().uuid(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  expiresAt: z.string().datetime(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
