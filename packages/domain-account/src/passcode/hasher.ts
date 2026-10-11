import { hash, verify, type Algorithm } from "@node-rs/argon2";
import type { PasscodeHasher } from "@notebook/contracts";

/**
 * Argon2 algorithm identifier constants matching @node-rs/argon2 enum values:
 * Argon2d = 0, Argon2i = 1, Argon2id = 2.
 */
export const Argon2Algorithm = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
} as const;

export type Argon2AlgorithmType = (typeof Argon2Algorithm)[keyof typeof Argon2Algorithm];

/**
 * Argon2 configuration object.
 * Centralized configuration ensuring no literal parameters appear at call sites.
 */
export interface Argon2Config {
  /** Memory cost in KiB. 65536 KiB = 64 MiB */
  memoryCost: number;
  /** Number of iterations */
  timeCost: number;
  /** Number of parallel lanes/threads */
  parallelism: number;
  /** Argon2 algorithm variant */
  algorithm: Algorithm | Argon2AlgorithmType;
}

/**
 * Settled PRD 6.3 / NOTEBENCH 0.1 Argon2id configuration:
 * m = 64 MiB (65536 KiB), t = 3 passes, p = 1 lane.
 */
export const DEFAULT_ARGON2_CONFIG: Argon2Config = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  algorithm: Argon2Algorithm.Argon2id,
};

/**
 * Production PasscodeHasher implementation backed by `@node-rs/argon2` (Rust N-API).
 * Produces standard RFC 9106 PHC modular strings ($argon2id$v=19$m=65536,t=3,p=1$...).
 */
export class Argon2PasscodeHasher implements PasscodeHasher {
  private readonly config: Argon2Config;

  constructor(config: Partial<Argon2Config> = {}) {
    this.config = {
      ...DEFAULT_ARGON2_CONFIG,
      ...config,
    };
  }

  async hash(passcode: string): Promise<string> {
    return hash(passcode, {
      memoryCost: this.config.memoryCost,
      timeCost: this.config.timeCost,
      parallelism: this.config.parallelism,
      algorithm: this.config.algorithm,
    });
  }

  async verify(phcHash: string, passcode: string): Promise<boolean> {
    try {
      return await verify(phcHash, passcode);
    } catch {
      return false;
    }
  }
}

/**
 * Lightweight, in-memory fake PasscodeHasher for fast, deterministic testing.
 */
export class FakePasscodeHasher implements PasscodeHasher {
  async hash(passcode: string): Promise<string> {
    const encoded = Buffer.from(passcode, "utf-8").toString("base64");
    return `$argon2id$v=19$m=65536,t=3,p=1$fake_salt$${encoded}`;
  }

  async verify(phcHash: string, passcode: string): Promise<boolean> {
    const expected = await this.hash(passcode);
    return phcHash === expected;
  }
}
