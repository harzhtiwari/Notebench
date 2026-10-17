import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { VAULT_CONSTANTS } from "./constants.js";
import { VaultError } from "./errors.js";

export interface ResolveMasterKeyOptions {
  readonly env?: Record<string, string | undefined> | undefined;
  readonly envVarName?: string | undefined;
  readonly vaultDir?: string | undefined;
  readonly keyFileName?: string | undefined;
  readonly allowGenerate?: boolean | undefined;
  readonly logger?: { info: (message: string, ...args: unknown[]) => void } | undefined;
}

export interface MasterKeyResult {
  readonly masterKey: Buffer;
  readonly source: "env" | "file" | "generated";
  readonly keyPath?: string | undefined;
}

/**
 * True when an fs error carries the EEXIST errno code.
 */
function isEexist(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "EEXIST";
}

/**
 * Reads and validates an existing master key file (64-char hex or 32 raw bytes).
 * Wraps raw fs failures as STORAGE_ERROR and invalid content as INVALID_MASTER_KEY.
 */
function readExistingKeyFile(keyPath: string): MasterKeyResult {
  try {
    const fileContent = fs.readFileSync(keyPath, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(fileContent)) {
      return {
        masterKey: Buffer.from(fileContent, "hex"),
        source: "file",
        keyPath,
      };
    }

    // Check if file is raw binary 32 bytes
    const rawBuf = fs.readFileSync(keyPath);
    if (rawBuf.length === VAULT_CONSTANTS.KEY_BYTE_LENGTH) {
      return {
        masterKey: rawBuf,
        source: "file",
        keyPath,
      };
    }

    throw new VaultError(
      `Master key file at '${keyPath}' must contain a 64-character hex string or 32 raw bytes`,
      "INVALID_MASTER_KEY"
    );
  } catch (err: unknown) {
    if (err instanceof VaultError) throw err;
    throw new VaultError(
      `Failed to read master key file at '${keyPath}': ${String(err)}`,
      "STORAGE_ERROR"
    );
  }
}

/**
 * Resolves the master vault key according to Decision 6.1 two-tier precedence:
 *   Tier 1: NOTEBOOK_MASTER_KEY environment variable (32 bytes hex).
 *   Tier 2: File .notebook/vault/master.key (auto-generated CSPRNG 32-byte hex if absent).
 *
 * Windows Note:
 * POSIX mode bits (0600) are passed to fs.writeFileSync. On Windows, NTFS uses ACLs rather
 * than POSIX permission bits; Node.js translates 0600 into standard file attributes without error.
 */
export function resolveMasterKey(
  options?: ResolveMasterKeyOptions
): MasterKeyResult {
  const env = options?.env ?? process.env;
  const envVarName = options?.envVarName ?? VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV;
  const vaultDir = options?.vaultDir ?? VAULT_CONSTANTS.DEFAULT_VAULT_DIR;
  const keyFileName = options?.keyFileName ?? VAULT_CONSTANTS.DEFAULT_MASTER_KEY_FILE;
  const allowGenerate = options?.allowGenerate ?? true;
  const logger = options?.logger;

  // 1. Tier 1: Environment Variable
  const envValue = env[envVarName];
  if (envValue !== undefined && envValue.trim() !== "") {
    const trimmed = envValue.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      throw new VaultError(
        `Environment variable ${envVarName} must contain exactly 64 hex characters (32 bytes)`,
        "INVALID_MASTER_KEY"
      );
    }
    const keyBuf = Buffer.from(trimmed, "hex");
    return {
      masterKey: keyBuf,
      source: "env",
    };
  }

  // 2. Tier 2: File Storage
  const keyPath = path.resolve(vaultDir, keyFileName);
  if (fs.existsSync(keyPath)) {
    return readExistingKeyFile(keyPath);
  }

  // 3. Auto-generation when absent
  if (!allowGenerate) {
    throw new VaultError(
      `Master key file not found at '${keyPath}' and auto-generation is disabled`,
      "KEY_NOT_FOUND"
    );
  }

  const generatedBuf = crypto.randomBytes(VAULT_CONSTANTS.KEY_BYTE_LENGTH);
  const hexKey = generatedBuf.toString("hex");

  try {
    fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
    // Exclusive create ('wx'): a concurrent boot that won the creation race must
    // not be clobbered by this one (TOCTOU guard).
    fs.writeFileSync(keyPath, hexKey + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (err: unknown) {
    if (isEexist(err)) {
      // Lost the race against a concurrent boot between the existence check and
      // exclusive create: adopt the winner's key instead of overwriting it.
      generatedBuf.fill(0);
      return readExistingKeyFile(keyPath);
    }
    throw new VaultError(
      `Failed to initialize auto-generated master key at '${keyPath}': ${String(err)}`,
      "STORAGE_ERROR"
    );
  }

  logger?.info(
    `[Vault] Generated new 32-byte master encryption key at '${keyPath}'. Ensure this file is backed up securely.`
  );

  return {
    masterKey: generatedBuf,
    source: "generated",
    keyPath,
  };
}
