import { describe, it, expect } from "vitest";
import {
  SetupAlreadyCompletedError,
  ValidationError,
  type AccountRepositoryPort,
  type UserRecord,
  type CreateOwnerInput,
} from "@notebook/contracts";
import {
  OwnerSetupService,
  validatePasscode,
  FakePasscodeHasher,
  Argon2PasscodeHasher,
  DEFAULT_ARGON2_CONFIG,
} from "./index.js";

/**
 * In-memory AccountRepositoryPort implementation for domain unit tests.
 */
class InMemoryAccountRepository implements AccountRepositoryPort {
  private owner: UserRecord | null = null;

  async findOwner(): Promise<UserRecord | null> {
    return this.owner;
  }

  async createOwner(input: CreateOwnerInput): Promise<UserRecord> {
    if (this.owner) {
      throw new Error("Owner already exists in memory");
    }
    const record: UserRecord = {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      email: input.email ?? null,
      displayName: input.displayName ?? null,
      passcodeHash: input.passcodeHash ?? null,
      role: "owner",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.owner = record;
    return record;
  }

  async updatePasscodeHash(userId: string, passcodeHash: string): Promise<UserRecord | null> {
    if (!this.owner || this.owner.id !== userId) {
      return null;
    }
    this.owner = {
      ...this.owner,
      passcodeHash,
      updatedAt: new Date().toISOString(),
    };
    return this.owner;
  }
}

describe("Owner Setup & Passcode (Ticket 01 - RED Phase)", () => {
  describe("NIST SP 800-63B-4 Section 3.1.1.2 Passcode Policy", () => {
    it("rejects passcodes shorter than 15 characters (single-factor minimum)", () => {
      expect(() => validatePasscode("short-passcode")).toThrow(ValidationError);
      expect(() => validatePasscode("12345678901234")).toThrow(ValidationError);
    });

    it("rejects passcodes longer than maximum allowed length (128 characters)", () => {
      const longPasscode = "a".repeat(129);
      expect(() => validatePasscode(longPasscode)).toThrow(ValidationError);
    });

    it("accepts passcodes of 15+ characters without composition rules (no mandatory symbols or digits)", () => {
      // Per NIST SP 800-63B-4: Verifiers SHALL NOT impose composition rules
      const plainLongPassphrase = "this is a valid passphrase with spaces";
      expect(() => validatePasscode(plainLongPassphrase)).not.toThrow();
      expect(validatePasscode(plainLongPassphrase)).toBe(plainLongPassphrase);
    });

    it("rejects passcodes on common or breached blocklists", () => {
      // Common sequential or dictionary passcodes
      expect(() => validatePasscode("passwordpassword")).toThrow(ValidationError);
      expect(() => validatePasscode("123456789012345")).toThrow(ValidationError);
      expect(() => validatePasscode("qwertyuiopasdfgh")).toThrow(ValidationError);
      expect(() => validatePasscode("correcthorsebatterystaple")).toThrow(ValidationError);
    });
  });

  describe("Owner Setup Service Lifecycle", () => {
    it("creates owner identity exactly once with optional passcode", async () => {
      const repo = new InMemoryAccountRepository();
      const hasher = new FakePasscodeHasher();
      const service = new OwnerSetupService({ repository: repo, hasher });

      const result = await service.setupOwner({
        displayName: "Sovereign Owner",
        email: "owner@notebench.local",
        passcode: "a-very-secure-passcode-phrase-here",
      });

      expect(result.owner.id).toBe("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d");
      expect(result.owner.displayName).toBe("Sovereign Owner");
      expect(result.owner.email).toBe("owner@notebench.local");
      expect(result.owner.role).toBe("owner");
      expect(result.owner.hasPasscode).toBe(true);

      // Plaintext passcode is NEVER returned
      expect(result).not.toHaveProperty("passcode");
      expect(result.owner).not.toHaveProperty("passcode");
      expect(result.owner).not.toHaveProperty("passcodeHash");
    });

    it("rejects subsequent setup attempts with stable code SETUP_ALREADY_COMPLETED", async () => {
      const repo = new InMemoryAccountRepository();
      const hasher = new FakePasscodeHasher();
      const service = new OwnerSetupService({ repository: repo, hasher });

      // First setup succeeds
      await service.setupOwner({
        displayName: "First Setup Owner",
        passcode: "valid-secure-first-passphrase-ok",
      });

      // Second setup MUST be rejected with SetupAlreadyCompletedError
      await expect(
        service.setupOwner({
          displayName: "Second Attempt Intruder",
          passcode: "another-passphrase-attempt-here",
        })
      ).rejects.toThrow(SetupAlreadyCompletedError);

      try {
        await service.setupOwner({ displayName: "Intruder" });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(SetupAlreadyCompletedError);
        const setupError = err as SetupAlreadyCompletedError;
        expect(setupError.code).toBe("SETUP_ALREADY_COMPLETED");
        expect(setupError.statusCode).toBe(409);
      }
    });

    it("creates owner with no passcode and reports 'no sign-in required'", async () => {
      const repo = new InMemoryAccountRepository();
      const hasher = new FakePasscodeHasher();
      const service = new OwnerSetupService({ repository: repo, hasher });

      const result = await service.setupOwner({
        displayName: "Zero Auth Owner",
      });

      expect(result.owner.hasPasscode).toBe(false);

      const appState = await service.getAppState();
      expect(appState.setupComplete).toBe(true);
      expect(appState.requiresPasscode).toBe(false);
      expect(appState.signInRequired).toBe(false);
      expect(appState.message?.toLowerCase()).toContain("no sign-in required");
    });

    it("reports setup pending when no owner exists in database", async () => {
      const repo = new InMemoryAccountRepository();
      const hasher = new FakePasscodeHasher();
      const service = new OwnerSetupService({ repository: repo, hasher });

      const appState = await service.getAppState();
      expect(appState.setupComplete).toBe(false);
      expect(appState.requiresPasscode).toBe(false);
      expect(appState.signInRequired).toBe(false);
    });

    it("verifies valid passcode and rejects wrong passcode against stored PHC hash", async () => {
      const repo = new InMemoryAccountRepository();
      const hasher = new FakePasscodeHasher();
      const service = new OwnerSetupService({ repository: repo, hasher });

      const passcode = "my-secret-vault-passcode-12345";
      await service.setupOwner({ passcode });

      const isValid = await service.verifyPasscode(passcode);
      expect(isValid).toBe(true);

      const isInvalid = await service.verifyPasscode("incorrect-passphrase-guessed");
      expect(isInvalid).toBe(false);
    });
  });

  describe("PasscodeHasher Port & Argon2id Specification", () => {
    it("uses default Argon2id parameters matching NOTEBENCH 6.3 (m=65536 KiB, t=3, p=1)", () => {
      expect(DEFAULT_ARGON2_CONFIG.memoryCost).toBe(65536);
      expect(DEFAULT_ARGON2_CONFIG.timeCost).toBe(3);
      expect(DEFAULT_ARGON2_CONFIG.parallelism).toBe(1);
    });

    it("Argon2PasscodeHasher produces standard RFC 9106 PHC string and verifies correctly", async () => {
      // Use real Argon2PasscodeHasher with lightweight test cost to verify N-API binary
      const realHasher = new Argon2PasscodeHasher({
        ...DEFAULT_ARGON2_CONFIG,
        memoryCost: 4096, // Fast in unit test
        timeCost: 1,
      });

      const secret = "testing-real-argon2id-binary-hash";
      const phcString = await realHasher.hash(secret);

      // Verify PHC string structure
      expect(phcString).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);

      // Verify right and wrong passcode
      const valid = await realHasher.verify(phcString, secret);
      expect(valid).toBe(true);

      const invalid = await realHasher.verify(phcString, "wrong-passcode-for-verification");
      expect(invalid).toBe(false);
    });
  });
});
