import crypto from "node:crypto";
import { VAULT_CONSTANTS } from "./constants.js";
import { VaultError } from "./errors.js";
import { VaultSecret } from "./secret.js";

export interface AadPayload {
  readonly schemaVersion: number;
  readonly provider: string;
  readonly keyId: string;
}

export interface VaultEnvelope {
  readonly schemaVersion: number;
  readonly provider: string;
  readonly keyId: string;
  readonly ciphertext: string; // base64url encoded
  readonly iv: string; // base64url encoded (96 bits / 12 bytes)
  readonly tag: string; // base64url encoded (128 bits / 16 bytes)
}

/**
 * Derives a deterministic 32-byte encryption subkey from a master key using HKDF-SHA256.
 * Salt is empty buffer per RFC 5869.
 * Info is 'notebench:vault:v1' per PRD Decision 6.1.
 */
export function deriveSubkey(masterKey: Buffer): Buffer {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== VAULT_CONSTANTS.KEY_BYTE_LENGTH) {
    throw new VaultError(
      `Master key must be a valid 32-byte Buffer (got ${Buffer.isBuffer(masterKey) ? masterKey.length : typeof masterKey})`,
      "INVALID_MASTER_KEY"
    );
  }

  const rawDerived = crypto.hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0),
    VAULT_CONSTANTS.HKDF_INFO,
    VAULT_CONSTANTS.KEY_BYTE_LENGTH
  );

  return Buffer.from(rawDerived);
}

/**
 * Deterministically serializes Additional Authenticated Data (AAD) into bytes.
 */
export function serializeAad(aad: AadPayload): Buffer {
  if (typeof aad.schemaVersion !== "number" || !aad.provider || !aad.keyId) {
    throw new VaultError(
      "Invalid AAD payload: schemaVersion, provider, and keyId are required",
      "VALIDATION_ERROR"
    );
  }

  const canonicalJson = JSON.stringify({
    schemaVersion: aad.schemaVersion,
    provider: aad.provider,
    keyId: aad.keyId,
  });

  return Buffer.from(canonicalJson, "utf8");
}

/**
 * Encrypts a secret using AES-256-GCM with a 96-bit random IV and 128-bit GHASH tag.
 * Cryptographically binds AAD { schemaVersion, provider, keyId } to prevent cut-and-paste attacks.
 */
export function encryptSecret(
  secret: string | Buffer,
  masterKey: Buffer,
  aad: AadPayload
): VaultEnvelope {
  const iv = crypto.randomBytes(VAULT_CONSTANTS.IV_BYTE_LENGTH);
  // AAD validation runs before the subkey exists so a serializeAad throw cannot
  // skip the subkey zeroing in the finally block below.
  const serializedAad = serializeAad(aad);
  const subkey = deriveSubkey(masterKey);

  const plaintextBuf = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8");

  try {
    const cipher = crypto.createCipheriv(VAULT_CONSTANTS.ALGORITHM, subkey, iv, {
      authTagLength: VAULT_CONSTANTS.TAG_BYTE_LENGTH,
    });

    cipher.setAAD(serializedAad);

    const ciphertextChunks: Buffer[] = [];
    ciphertextChunks.push(cipher.update(plaintextBuf));
    ciphertextChunks.push(cipher.final());

    const ciphertext = Buffer.concat(ciphertextChunks);
    const tag = cipher.getAuthTag();

    return {
      schemaVersion: aad.schemaVersion,
      provider: aad.provider,
      keyId: aad.keyId,
      ciphertext: ciphertext.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: tag.toString("base64url"),
    };
  } finally {
    subkey.fill(0);
    if (plaintextBuf !== secret) {
      // Zero our own string→Buffer copy; caller-owned buffers are not ours to wipe.
      plaintextBuf.fill(0);
    }
  }
}

/**
 * Decrypts a vault envelope using AES-256-GCM with strict RUP (Release of Unverified Plaintext) defense.
 * Intermediate chunks are retained internally and verified against the GCM auth tag before exposure.
 */
export function decryptSecret(
  envelope: VaultEnvelope,
  masterKey: Buffer
): VaultSecret {
  if (!envelope || !envelope.ciphertext || !envelope.iv || !envelope.tag) {
    throw new VaultError("Malformed vault envelope: missing required fields", "VALIDATION_ERROR");
  }

  const iv = Buffer.from(envelope.iv, "base64url");
  if (iv.length !== VAULT_CONSTANTS.IV_BYTE_LENGTH) {
    throw new VaultError(
      `Invalid IV length: expected ${VAULT_CONSTANTS.IV_BYTE_LENGTH} bytes, got ${iv.length}`,
      "VALIDATION_ERROR"
    );
  }

  const tag = Buffer.from(envelope.tag, "base64url");
  if (tag.length !== VAULT_CONSTANTS.TAG_BYTE_LENGTH) {
    throw new VaultError(
      `Invalid auth tag length: expected ${VAULT_CONSTANTS.TAG_BYTE_LENGTH} bytes, got ${tag.length}`,
      "VALIDATION_ERROR"
    );
  }

  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  const serializedAad = serializeAad({
    schemaVersion: envelope.schemaVersion,
    provider: envelope.provider,
    keyId: envelope.keyId,
  });

  const subkey = deriveSubkey(masterKey);
  const intermediateChunks: Buffer[] = [];

  try {
    const decipher = crypto.createDecipheriv(VAULT_CONSTANTS.ALGORITHM, subkey, iv, {
      authTagLength: VAULT_CONSTANTS.TAG_BYTE_LENGTH,
    });

    decipher.setAuthTag(tag);
    decipher.setAAD(serializedAad);

    intermediateChunks.push(decipher.update(ciphertext));
    intermediateChunks.push(decipher.final());

    const fullPlaintext = Buffer.concat(intermediateChunks);
    try {
      return new VaultSecret(fullPlaintext);
    } finally {
      // VaultSecret owns its own copy; wipe the concat buffer immediately.
      fullPlaintext.fill(0);
    }
  } catch (err: unknown) {
    if (err instanceof VaultError) {
      throw err;
    }

    throw new VaultError(
      "Ciphertext integrity verification failed (tampered ciphertext, wrong AAD context, invalid tag, or incorrect key)",
      "TAMPERED_CIPHERTEXT",
      {
        provider: envelope.provider,
        keyId: envelope.keyId,
        schemaVersion: envelope.schemaVersion,
      }
    );
  } finally {
    // Zero every intermediate plaintext buffer on both success and failure paths.
    for (const chunk of intermediateChunks) {
      chunk.fill(0);
    }
    subkey.fill(0);
  }
}
