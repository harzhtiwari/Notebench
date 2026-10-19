import { z } from "zod";

export const SessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  lastActiveAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionInputSchema = z.object({
  userId: z.uuid(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  expiresAt: z.iso.datetime(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
