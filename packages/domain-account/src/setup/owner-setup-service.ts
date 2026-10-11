import {
  SetupAlreadyCompletedError,
  type AccountRepositoryPort,
  type PasscodeHasher,
  type SetupOwnerInput,
  type SetupOwnerResult,
  type AppStateResult,
  type UserRecord,
} from "@notebook/contracts";
import { validatePasscode } from "../passcode/policy.js";
import { Argon2PasscodeHasher } from "../passcode/hasher.js";

export interface OwnerSetupServiceDependencies {
  repository: AccountRepositoryPort;
  hasher?: PasscodeHasher | undefined;
}

/**
 * Domain Service orchestrating single-user owner onboarding, optional Argon2id passcode setup,
 * and application access state evaluation.
 */
export class OwnerSetupService {
  private readonly repository: AccountRepositoryPort;
  private readonly hasher: PasscodeHasher;

  constructor(deps: OwnerSetupServiceDependencies) {
    this.repository = deps.repository;
    this.hasher = deps.hasher ?? new Argon2PasscodeHasher();
  }

  /**
   * Initializes the sovereign owner identity once.
   * Subsequent invocations strictly throw SetupAlreadyCompletedError.
   */
  async setupOwner(input: SetupOwnerInput): Promise<SetupOwnerResult> {
    const existingOwner = await this.repository.findOwner();
    if (existingOwner) {
      throw new SetupAlreadyCompletedError(
        "Owner setup has already been completed. Setup route is permanently disabled."
      );
    }

    let passcodeHash: string | undefined = undefined;
    if (input.passcode !== undefined && input.passcode.length > 0) {
      const validated = validatePasscode(input.passcode);
      passcodeHash = await this.hasher.hash(validated);
    }

    const createdRecord = await this.repository.createOwner({
      displayName: input.displayName ?? null,
      email: input.email ?? null,
      passcodeHash: passcodeHash ?? null,
    });

    return {
      owner: {
        id: createdRecord.id,
        email: createdRecord.email,
        displayName: createdRecord.displayName,
        role: "owner",
        hasPasscode: Boolean(createdRecord.passcodeHash),
        createdAt: createdRecord.createdAt,
      },
    };
  }

  /**
   * Evaluates application setup and session sign-in requirements.
   * If no passcode is configured, explicitly reports 'no sign-in required'.
   */
  async getAppState(): Promise<AppStateResult> {
    const owner = await this.repository.findOwner();

    if (!owner) {
      return {
        setupComplete: false,
        requiresPasscode: false,
        signInRequired: false,
        message: "Setup required: First-run owner account has not been configured.",
      };
    }

    const hasPasscode = Boolean(owner.passcodeHash);

    if (hasPasscode) {
      return {
        setupComplete: true,
        requiresPasscode: true,
        signInRequired: true,
        message: "Passcode configured: Sign-in required.",
      };
    }

    return {
      setupComplete: true,
      requiresPasscode: false,
      signInRequired: false,
      message: "no sign-in required: Sovereign single-user mode active.",
    };
  }

  /**
   * Verifies a provided passcode against the stored owner Argon2id hash.
   */
  async verifyPasscode(passcode: string): Promise<boolean> {
    const owner = await this.repository.findOwner();
    if (!owner || !owner.passcodeHash) {
      return false;
    }

    return this.hasher.verify(owner.passcodeHash, passcode);
  }

  /**
   * Returns the owner record if configured.
   */
  async getOwner(): Promise<UserRecord | null> {
    return this.repository.findOwner();
  }
}
