import {
  RateLimitedError,
  ValidationError,
  type AccountRepositoryPort,
  type PasscodeHasher,
  type SessionRecord,
  type SessionRepositoryPort,
  type SessionSummary,
} from "@notebench/contracts";
import { validatePasscode } from "../passcode/policy.js";
import {
  SESSION_CONFIG,
  generateSessionToken,
  hashSessionToken,
} from "./crypto.js";

export interface SessionServiceDependencies {
  accountRepository: AccountRepositoryPort;
  sessionRepository: SessionRepositoryPort;
  hasher: PasscodeHasher;
  /** Injectable clock (milliseconds). Defaults to Date.now; tests inject a fake. */
  now?: (() => number) | undefined;
}

export interface LoginAttemptInput {
  passcode: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export type LoginOutcome =
  | { sessionRequired: false }
  | {
      sessionRequired: true;
      sessionId: string;
      userId: string;
      rawToken: string;
      expiresAt: string;
    };

export interface ChangePasscodeOutcome {
  revokedSessions: number;
}

/**
 * Domain service orchestrating passcode login, sliding session validation,
 * brute-force lockout, and session revocation (NOTEBENCH 1.41, 6.4, 6.5, 6.6).
 * Raw tokens never touch storage: only their SHA-256 digest is persisted.
 */
export class SessionService {
  private readonly accountRepository: AccountRepositoryPort;
  private readonly sessionRepository: SessionRepositoryPort;
  private readonly hasher: PasscodeHasher;
  private readonly now: () => number;
  private consecutiveFailures = 0;
  private lockedUntilMs = 0;

  constructor(deps: SessionServiceDependencies) {
    this.accountRepository = deps.accountRepository;
    this.sessionRepository = deps.sessionRepository;
    this.hasher = deps.hasher;
    this.now = deps.now ?? Date.now;
  }

  /**
   * Opens a session for the correct owner passcode.
   * With no passcode configured, reports no sign-in required and creates nothing.
   */
  async login(input: LoginAttemptInput): Promise<LoginOutcome> {
    const nowMs = this.now();
    const owner = await this.accountRepository.findOwner();
    if (!owner) {
      throw new ValidationError("Owner setup has not been completed.", {
        reason: "setup_required",
      });
    }
    if (!owner.passcodeHash) {
      return { sessionRequired: false };
    }

    this.assertNotLocked(nowMs);
    const valid = await this.hasher.verify(owner.passcodeHash, input.passcode);
    if (!valid) {
      this.recordFailure(nowMs);
    }
    this.consecutiveFailures = 0;

    const rawToken = generateSessionToken();
    const expiresAt = new Date(nowMs + SESSION_CONFIG.maxAgeSeconds * 1000).toISOString();
    const created = await this.sessionRepository.createSession({
      userId: owner.id,
      tokenHash: hashSessionToken(rawToken),
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    });
    return {
      sessionRequired: true,
      sessionId: created.id,
      userId: owner.id,
      rawToken,
      expiresAt,
    };
  }

  /**
   * Validates a raw session token and renews its sliding expiry.
   * Expired sessions are rejected and purged.
   */
  async validateSession(rawToken: string): Promise<SessionRecord | null> {
    const nowMs = this.now();
    const record = await this.sessionRepository.findByTokenHash(hashSessionToken(rawToken));
    if (!record) {
      return null;
    }
    if (Date.parse(record.expiresAt) <= nowMs) {
      await this.sessionRepository.deleteSession(record.id);
      return null;
    }
    const renewed = await this.sessionRepository.touchSession(record.id, {
      lastActiveAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + SESSION_CONFIG.maxAgeSeconds * 1000).toISOString(),
    });
    return renewed;
  }

  /**
   * Ends the current session only (logout).
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessionRepository.deleteSession(sessionId);
  }

  /**
   * Ends every session of a user (log out everywhere, PRD A5).
   */
  async logoutEverywhere(userId: string): Promise<number> {
    return this.sessionRepository.deleteAllSessions(userId);
  }

  /**
   * Lists a user's sessions as public summaries (digests never exposed).
   */
  async listSessions(userId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    const rows = await this.sessionRepository.listSessions(userId);
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      lastActiveAt: row.lastActiveAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      current: row.id === currentSessionId,
    }));
  }

  /**
   * Changes the owner passcode and revokes every other session in the same
   * flow while the current session stays active (NOTEBENCH 6.6, PRD A4).
   */
  async changePasscode(input: {
    currentSessionId: string;
    currentPasscode: string;
    newPasscode: string;
  }): Promise<ChangePasscodeOutcome> {
    const nowMs = this.now();
    const owner = await this.accountRepository.findOwner();
    if (!owner) {
      throw new ValidationError("Owner setup has not been completed.", {
        reason: "setup_required",
      });
    }
    if (!owner.passcodeHash) {
      throw new ValidationError("No passcode is configured.", {
        reason: "no_passcode_configured",
      });
    }

    this.assertNotLocked(nowMs);
    const valid = await this.hasher.verify(owner.passcodeHash, input.currentPasscode);
    if (!valid) {
      this.recordFailure(nowMs);
    }
    this.consecutiveFailures = 0;

    const validated = validatePasscode(input.newPasscode);
    const newHash = await this.hasher.hash(validated);
    const updated = await this.accountRepository.updatePasscodeHash(owner.id, newHash);
    if (!updated) {
      throw new ValidationError("Owner account no longer exists.", {
        reason: "owner_missing",
      });
    }
    const revokedSessions = await this.sessionRepository.deleteOtherSessions(
      owner.id,
      input.currentSessionId
    );
    return { revokedSessions };
  }

  private assertNotLocked(nowMs: number): void {
    if (nowMs < this.lockedUntilMs) {
      throw new RateLimitedError("Too many failed passcode attempts. Try again shortly.", {
        retryAfterSeconds: Math.ceil((this.lockedUntilMs - nowMs) / 1000),
        locked: true,
      });
    }
    if (this.lockedUntilMs > 0) {
      this.lockedUntilMs = 0;
      this.consecutiveFailures = 0;
    }
  }

  private recordFailure(nowMs: number): never {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= SESSION_CONFIG.lockoutMaxAttempts) {
      this.lockedUntilMs = nowMs + SESSION_CONFIG.lockoutWindowSeconds * 1000;
    }
    throw new ValidationError("Incorrect passcode.", {
      attemptsRemaining: Math.max(
        SESSION_CONFIG.lockoutMaxAttempts - this.consecutiveFailures,
        0
      ),
    });
  }
}
