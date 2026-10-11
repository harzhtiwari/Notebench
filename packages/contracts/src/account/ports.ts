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
 * Account Repository Port Interface.
 * Abstract data gateway implemented by infra-db (e.g. SQLite / PostgreSQL).
 */
export interface AccountRepositoryPort {
  findOwner(): Promise<UserRecord | null>;
  createOwner(input: CreateOwnerInput): Promise<UserRecord>;
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
