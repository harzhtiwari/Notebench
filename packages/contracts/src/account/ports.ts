import { z } from "zod";

/**
 * NIST SP 800-63B-4 Section 3.1.1.2 Passcode Length Parameters
 */
export const PASSCODE_MIN_LENGTH = 15;
export const PASSCODE_MAX_LENGTH = 128;

/**
 * PasscodeHasher Port Interface.
 * Abstracts Argon2id (or experimental native crypto.argon2) password hashing engine.
 */
export interface PasscodeHasher {
  hash(passcode: string): Promise<string>;
  verify(hash: string, passcode: string): Promise<boolean>;
}

/**
 * Canonical User Record representation in storage.
 */
export interface UserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
  passcodeHash: string | null;
  role: "owner" | "member";
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating the primary local owner account.
 */
export interface CreateOwnerInput {
  email?: string | null | undefined;
  displayName?: string | null | undefined;
  passcodeHash?: string | null | undefined;
}

/**
 * Result of the atomic passcode change (NOTEBENCH 6.6): the updated owner
 * record plus how many other sessions were revoked.
 */
export interface PasscodeChangeResult {
  user: UserRecord;
  revokedSessions: number;
}

/**
 * Account Repository Port Interface.
 * Abstract data gateway implemented by infra-db (e.g. SQLite / PostgreSQL).
 */
export interface AccountRepositoryPort {
  findOwner(): Promise<UserRecord | null>;
  /**
   * Atomically creates the single owner account.
   * Throws SetupAlreadyCompletedError when an owner already exists, including
   * when concurrent setup calls both pass the findOwner() pre-check.
   */
  createOwner(input: CreateOwnerInput): Promise<UserRecord>;
  /**
   * Atomically updates the owner passcode hash and revokes every session of
   * the user except `keepSessionId` inside one transaction (NOTEBENCH 6.6,
   * PRD A4). Returns null when the user row no longer exists; otherwise the
   * updated record and the number of revoked sessions.
   */
  updatePasscodeAndRevokeOtherSessions(
    userId: string,
    passcodeHash: string,
    keepSessionId: string
  ): Promise<PasscodeChangeResult | null>;
}

/**
 * Schema and DTO for first-run owner setup request.
 */
export const SetupOwnerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().optional(),
  passcode: z.string().optional(),
});
export type SetupOwnerInput = z.infer<typeof SetupOwnerInputSchema>;

/**
 * Schema and DTO for first-run owner setup result.
 * Plaintext passcode and hash are strictly excluded.
 */
export const SetupOwnerResultSchema = z.object({
  owner: z.object({
    id: z.string().uuid(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    role: z.literal("owner"),
    hasPasscode: z.boolean(),
    createdAt: z.string(),
  }),
});
export type SetupOwnerResult = z.infer<typeof SetupOwnerResultSchema>;

/**
 * Schema and DTO for application setup and sign-in status probe (/api/app-state).
 */
export const AppStateResultSchema = z.object({
  setupComplete: z.boolean(),
  requiresPasscode: z.boolean(),
  signInRequired: z.boolean(),
  message: z.string().optional(),
});
export type AppStateResult = z.infer<typeof AppStateResultSchema>;

/**
 * Canonical session record representation in storage.
 * The raw token is never stored; only its SHA-256 hex digest (tokenHash).
 */
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Input for creating a session row. Token hashing happens in domain-account;
 * repositories receive only the digest.
 */
export interface CreateSessionRecordInput {
  userId: string;
  tokenHash: string;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
  expiresAt: string;
}

/**
 * Session Repository Port Interface.
 * Abstract data gateway implemented by infra-db (SQLite / PostgreSQL).
 */
export interface SessionRepositoryPort {
  createSession(input: CreateSessionRecordInput): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(
    id: string,
    input: { lastActiveAt: string; expiresAt: string }
  ): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  deleteAllSessions(userId: string): Promise<number>;
  listSessions(userId: string): Promise<SessionRecord[]>;
}

/**
 * Public session summary (token digests are never exposed).
 */
export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastActiveAt: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/**
 * Schema and DTO for passcode login.
 */
export const LoginInputSchema = z.object({
  passcode: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * Schema and DTO for passcode change (revokes every other session).
 */
export const ChangePasscodeInputSchema = z.object({
  currentPasscode: z.string().min(1),
  newPasscode: z.string().min(1),
});
export type ChangePasscodeInput = z.infer<typeof ChangePasscodeInputSchema>;
