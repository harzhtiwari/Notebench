import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  RateLimitedError,
  SetupAlreadyCompletedError,
  ValidationError,
  type AccountRepositoryPort,
  type CreateOwnerInput,
  type CreateSessionRecordInput,
  type PasscodeChangeResult,
  type SessionRecord,
  type SessionRepositoryPort,
  type UserRecord,
} from "@notebench/contracts";
import {
  FakePasscodeHasher,
  SESSION_CONFIG,
  buildSessionCookieOptions,
  generateSessionToken,
  hashSessionToken,
  resolveSessionCookieName,
  SessionService,
} from "../index.js";

/**
 * In-memory AccountRepositoryPort implementation for session unit tests.
 * The atomic passcode change reaches into the session fake's rows, mirroring
 * the single SQLite database the real repositories share.
 */
class InMemoryAccountRepository implements AccountRepositoryPort {
  private owner: UserRecord | null = null;

  /** Test hook: simulates the owner row vanishing between findOwner() and the write. */
  vanishOnWrite = false;

  constructor(private readonly sessions: InMemorySessionRepository) {}

  async findOwner(): Promise<UserRecord | null> {
    return this.owner;
  }

  async createOwner(input: CreateOwnerInput): Promise<UserRecord> {
    if (this.owner) {
      throw new SetupAlreadyCompletedError(
        "Owner setup has already been completed (in-memory repository)."
      );
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

  async updatePasscodeAndRevokeOtherSessions(
    userId: string,
    passcodeHash: string,
    keepSessionId: string
  ): Promise<PasscodeChangeResult | null> {
    if (this.vanishOnWrite || !this.owner || this.owner.id !== userId) {
      return null;
    }
    this.owner = { ...this.owner, passcodeHash, updatedAt: new Date().toISOString() };
    const revokedSessions = await this.sessions.deleteOtherSessions(userId, keepSessionId);
    return { user: this.owner, revokedSessions };
  }
}

/**
 * In-memory SessionRepositoryPort implementation for session unit tests.
 */
class InMemorySessionRepository implements SessionRepositoryPort {
  readonly rows = new Map<string, SessionRecord>();

  async createSession(input: CreateSessionRecordInput): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: `session-${this.rows.size + 1}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      lastActiveAt: now,
      expiresAt: input.expiresAt,
      createdAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const row of this.rows.values()) {
      if (row.tokenHash === tokenHash) return row;
    }
    return null;
  }

  async touchSession(
    id: string,
    input: { lastActiveAt: string; expiresAt: string }
  ): Promise<SessionRecord | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated: SessionRecord = { ...row, ...input };
    this.rows.set(id, updated);
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async deleteOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    let revoked = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId && id !== currentSessionId) {
        this.rows.delete(id);
        revoked += 1;
      }
    }
    return revoked;
  }

  async deleteAllSessions(userId: string): Promise<number> {
    let revoked = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        revoked += 1;
      }
    }
    return revoked;
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }
}

const PASSCODE = "a-very-secure-passcode-phrase-here";

describe("SessionService (Ticket 02 - RED Phase)", () => {
  let accountRepo: InMemoryAccountRepository;
  let sessionRepo: InMemorySessionRepository;
  let nowMs: number;
  let service: SessionService;

  beforeEach(async () => {
    sessionRepo = new InMemorySessionRepository();
    accountRepo = new InMemoryAccountRepository(sessionRepo);
    nowMs = 1_700_000_000_000;
    service = new SessionService({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      hasher: new FakePasscodeHasher(),
      now: () => nowMs,
    });
    const hasher = new FakePasscodeHasher();
    await accountRepo.createOwner({
      displayName: "Owner",
      email: null,
      passcodeHash: await hasher.hash(PASSCODE),
    });
  });

  it("opens a session for the correct passcode and stores only the SHA-256 digest", async () => {
    const result = await service.login({ passcode: PASSCODE });

    expect(result.sessionRequired).toBe(true);
    if (!result.sessionRequired) return;
    // Raw token carries 32 random bytes in base64url form
    expect(Buffer.from(result.rawToken, "base64url").length).toBe(32);

    const stored = await sessionRepo.findByTokenHash(hashSessionToken(result.rawToken));
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.tokenHash).toBe(createHash("sha256").update(result.rawToken).digest("hex"));
    // The raw token itself never lands in storage
    for (const row of sessionRepo.rows.values()) {
      expect(row.tokenHash.includes(result.rawToken)).toBe(false);
    }
  });

  it("rejects a wrong passcode without opening a session", async () => {
    await expect(service.login({ passcode: "incorrect-passphrase-guessed-ok" })).rejects.toThrow(
      ValidationError
    );
    expect(sessionRepo.rows.size).toBe(0);
  });

  it("locks out after 5 failures and resumes after 60s (fake clock)", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await service.login({ passcode: `wrong-passphrase-number-${attempt}-ok` });
        expect.unreachable();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).details?.["attemptsRemaining"]).toBe(5 - attempt);
      }
    }

    // Sixth attempt inside the window is refused even with the right passcode
    try {
      await service.login({ passcode: PASSCODE });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(RateLimitedError);
      const details = (err as RateLimitedError).details ?? {};
      expect(details["retryAfterSeconds"]).toBe(SESSION_CONFIG.lockoutWindowSeconds);
    }

    // Access resumes once the 60s window elapses
    nowMs += SESSION_CONFIG.lockoutWindowSeconds * 1000 + 1000;
    const result = await service.login({ passcode: PASSCODE });
    expect(result.sessionRequired).toBe(true);
  });

  it("rejects expired sessions and extends active ones (sliding 30-day lifetime)", async () => {
    const login = await service.login({ passcode: PASSCODE });
    if (!login.sessionRequired) return expect.unreachable();
    const firstExpiry = login.expiresAt;

    // Active request renews the expiry
    nowMs += 24 * 3600 * 1000;
    const renewed = await service.validateSession(login.rawToken);
    expect(renewed).not.toBeNull();
    expect(Date.parse(renewed?.expiresAt ?? "")).toBeGreaterThan(Date.parse(firstExpiry));

    // Past-expiry sessions are rejected and purged
    nowMs = Date.parse(renewed?.expiresAt ?? "") + 1000;
    expect(await service.validateSession(login.rawToken)).toBeNull();
    expect(sessionRepo.rows.size).toBe(0);
  });

  it("passcode change revokes all other sessions and keeps the current one", async () => {
    const first = await service.login({ passcode: PASSCODE });
    const second = await service.login({ passcode: PASSCODE });
    if (!first.sessionRequired || !second.sessionRequired) return expect.unreachable();

    const changed = await service.changePasscode({
      currentSessionId: first.sessionId,
      currentPasscode: PASSCODE,
      newPasscode: "a-brand-new-secure-passphrase-here",
    });
    expect(changed.revokedSessions).toBe(1);

    expect(await service.validateSession(first.rawToken)).not.toBeNull();
    expect(await service.validateSession(second.rawToken)).toBeNull();

    // New passcode authenticates, old one does not
    const relogin = await service.login({ passcode: "a-brand-new-secure-passphrase-here" });
    expect(relogin.sessionRequired).toBe(true);
    await expect(service.login({ passcode: PASSCODE })).rejects.toThrow(ValidationError);
  });

  it("reports owner_missing when the owner vanishes at the atomic write", async () => {
    const loggedIn = await service.login({ passcode: PASSCODE });
    if (!loggedIn.sessionRequired) return expect.unreachable();

    accountRepo.vanishOnWrite = true;
    try {
      await service.changePasscode({
        currentSessionId: loggedIn.sessionId,
        currentPasscode: PASSCODE,
        newPasscode: "a-brand-new-secure-passphrase-here",
      });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.["reason"]).toBe("owner_missing");
    }

    // The failed change leaves the current session untouched.
    expect(await service.validateSession(loggedIn.rawToken)).not.toBeNull();
  });

  it("logout ends the current session only; logout-everywhere clears all", async () => {
    const first = await service.login({ passcode: PASSCODE });
    const second = await service.login({ passcode: PASSCODE });
    if (!first.sessionRequired || !second.sessionRequired) return expect.unreachable();

    await service.logout(first.sessionId);
    expect(await service.validateSession(first.rawToken)).toBeNull();
    expect(await service.validateSession(second.rawToken)).not.toBeNull();

    const revoked = await service.logoutEverywhere(second.userId);
    expect(revoked).toBe(1);
    expect(await service.listSessions(second.userId)).toHaveLength(0);
  });

  it("reports no sign-in required when the owner has no passcode", async () => {
    const plainRepo = new InMemoryAccountRepository(new InMemorySessionRepository());
    await plainRepo.createOwner({ displayName: "No Passcode", passcodeHash: null });
    const plainService = new SessionService({
      accountRepository: plainRepo,
      sessionRepository: new InMemorySessionRepository(),
      hasher: new FakePasscodeHasher(),
      now: () => nowMs,
    });

    const result = await plainService.login({ passcode: "anything-at-all" });
    expect(result.sessionRequired).toBe(false);
  });

  it("uses one config object for lifetime and lockout (no literal parameters)", () => {
    expect(SESSION_CONFIG.lifetimeDays).toBe(30);
    expect(SESSION_CONFIG.maxAgeSeconds).toBe(30 * 24 * 3600);
    expect(SESSION_CONFIG.lockoutMaxAttempts).toBe(5);
    expect(SESSION_CONFIG.lockoutWindowSeconds).toBe(60);
  });

  it("builds HttpOnly Lax Path=/ cookie options with HTTPS-aware naming", () => {
    expect(resolveSessionCookieName(true)).toBe("__Host-notebench_session");
    expect(resolveSessionCookieName(false)).toBe("notebench_session");

    const httpsOptions = buildSessionCookieOptions(true);
    expect(httpsOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      signed: true,
      maxAge: SESSION_CONFIG.maxAgeSeconds,
    });
    expect(buildSessionCookieOptions(false).secure).toBe(false);

    const token = generateSessionToken();
    expect(Buffer.from(token, "base64url").length).toBe(32);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
