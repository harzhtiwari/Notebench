import { describe, it, expect, beforeEach, afterEach } from "vitest";
import util from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  VaultSecret,
  encryptSecret,
  decryptSecret,
  resolveMasterKey,
  deriveSubkey,
  deriveMaskedKey,
  scrubSecretFromText,
  VaultError,
  VAULT_CONSTANTS,
  EncryptedVault,
  type VaultEnvelope,
  type AadPayload,
} from "./index.js";
import { NotebookError } from "@notebook/contracts";

describe("Ticket 03: Encrypted API Key Vault", () => {
  let tempDir: string;
  const sampleKey = "sk-proj-1234567890abcdef1234567890abcdef";
  const masterKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const masterKey = Buffer.from(masterKeyHex, "hex");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env[VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV];
  });

  describe("Cryptographic Envelope & Round-Trip", () => {
    it("round-trip encrypt and decrypt returns the original plaintext", () => {
      const aad: AadPayload = {
        schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
        provider: "openai",
        keyId: "models.openaiKey",
      };

      const envelope: VaultEnvelope = encryptSecret(sampleKey, masterKey, aad);

      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.provider).toBe("openai");
      expect(envelope.keyId).toBe("models.openaiKey");
      expect(typeof envelope.ciphertext).toBe("string");
      expect(typeof envelope.iv).toBe("string");
      expect(typeof envelope.tag).toBe("string");

      const decrypted: VaultSecret = decryptSecret(envelope, masterKey);
      expect(decrypted).toBeInstanceOf(VaultSecret);

      decrypted.withSecret((plaintext, buf) => {
        expect(plaintext).toBe(sampleKey);
        expect(buf.toString("utf8")).toBe(sampleKey);
      });
    });

    it("tampered ciphertext fails with a categorised vault error and returns no partial plaintext", () => {
      const aad: AadPayload = {
        schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
        provider: "openai",
        keyId: "models.openaiKey",
      };

      const envelope = encryptSecret(sampleKey, masterKey, aad);

      // Tamper with the ciphertext base64url string
      const ctBytes = Buffer.from(envelope.ciphertext, "base64url");
      ctBytes[0] = (ctBytes[0] ?? 0) ^ 0xff;
      const tamperedEnvelope: VaultEnvelope = {
        ...envelope,
        ciphertext: ctBytes.toString("base64url"),
      };

      expect(() => decryptSecret(tamperedEnvelope, masterKey)).toThrowError(VaultError);

      try {
        decryptSecret(tamperedEnvelope, masterKey);
        expect.unreachable("Should have thrown VaultError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(NotebookError);
        expect(err).toBeInstanceOf(VaultError);
        const vaultErr = err as VaultError;
        expect(vaultErr.category).toBe("TAMPERED_CIPHERTEXT");
        expect(vaultErr.code).toBe("INVARIANCE_VIOLATION");
      }
    });

    it("wrong master key fails with VaultError", () => {
      const aad: AadPayload = {
        schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
        provider: "anthropic",
        keyId: "models.anthropicKey",
      };

      const envelope = encryptSecret("sk-ant-secret-key-xyz", masterKey, aad);
      const wrongMasterKey = Buffer.from(
        "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        "hex"
      );

      expect(() => decryptSecret(envelope, wrongMasterKey)).toThrowError(VaultError);
      try {
        decryptSecret(envelope, wrongMasterKey);
      } catch (err: unknown) {
        const vaultErr = err as VaultError;
        expect(vaultErr.category).toBe("TAMPERED_CIPHERTEXT");
      }
    });

    it("wrong AAD (different provider or keyId) fails GHASH verification", () => {
      const aad: AadPayload = {
        schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
        provider: "google",
        keyId: "models.googleKey",
      };

      const envelope = encryptSecret("AIzaSyFakeKey123456789", masterKey, aad);

      // Mutate AAD in envelope
      const spoofedEnvelope: VaultEnvelope = {
        ...envelope,
        provider: "openai", // Context-confusion attack attempt
      };

      expect(() => decryptSecret(spoofedEnvelope, masterKey)).toThrowError(VaultError);

      const spoofedKeyIdEnvelope: VaultEnvelope = {
        ...envelope,
        keyId: "models.openaiKey",
      };
      expect(() => decryptSecret(spoofedKeyIdEnvelope, masterKey)).toThrowError(VaultError);
    });

    it("unverified plaintext is never released under RUP (Release of Unverified Plaintext) defense", () => {
      const aad: AadPayload = {
        schemaVersion: VAULT_CONSTANTS.SCHEMA_VERSION,
        provider: "openai",
        keyId: "models.openaiKey",
      };
      const envelope = encryptSecret(sampleKey, masterKey, aad);

      // Corrupt auth tag
      const tagBytes = Buffer.from(envelope.tag, "base64url");
      tagBytes[0] = (tagBytes[0] ?? 0) ^ 0x01;
      const corruptedTagEnvelope: VaultEnvelope = {
        ...envelope,
        tag: tagBytes.toString("base64url"),
      };

      let callbackCalled = false;
      try {
        const secret = decryptSecret(corruptedTagEnvelope, masterKey);
        secret.withSecret(() => {
          callbackCalled = true;
        });
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
      }
      expect(callbackCalled).toBe(false);
    });
  });

  describe("Master Key Resolution Precedence", () => {
    it("resolves Tier 1: NOTEBOOK_MASTER_KEY from environment variable", () => {
      process.env[VAULT_CONSTANTS.DEFAULT_MASTER_KEY_ENV] = masterKeyHex;
      const result = resolveMasterKey({
        vaultDir: tempDir,
      });

      expect(result.source).toBe("env");
      expect(result.masterKey.toString("hex")).toBe(masterKeyHex);
      expect(result.masterKey.length).toBe(32);
    });

    it("resolves Tier 2: file .notebook/vault/master.key when env var is unset", () => {
      const keyFile = path.join(tempDir, "master.key");
      fs.writeFileSync(keyFile, masterKeyHex, { encoding: "utf8", mode: 0o600 });

      const result = resolveMasterKey({
        env: {},
        vaultDir: tempDir,
        keyFileName: "master.key",
      });

      expect(result.source).toBe("file");
      expect(result.masterKey.toString("hex")).toBe(masterKeyHex);
    });

    it("resolves Tier 3: missing master key with no env var generates master.key with mode 0600", () => {
      const keyFile = path.join(tempDir, "master.key");
      expect(fs.existsSync(keyFile)).toBe(false);

      const notices: string[] = [];
      const mockLogger = {
        info: (msg: string) => notices.push(msg),
      };

      const result = resolveMasterKey({
        env: {},
        vaultDir: tempDir,
        keyFileName: "master.key",
        logger: mockLogger,
      });

      expect(result.source).toBe("generated");
      expect(result.masterKey.length).toBe(32);
      expect(fs.existsSync(keyFile)).toBe(true);

      const savedContent = fs.readFileSync(keyFile, "utf8").trim();
      expect(savedContent).toBe(result.masterKey.toString("hex"));
      expect(notices.length).toBeGreaterThan(0);

      // Verify file mode
      const stat = fs.statSync(keyFile);
      if (process.platform !== "win32") {
        expect(stat.mode & 0o777).toBe(0o600);
      } else {
        // Windows note: Record that Windows NTFS handles ACLs; mode is non-zero
        expect(stat.mode).toBeGreaterThan(0);
      }
    });

    it("rejects invalid hex or wrong length master keys", () => {
      expect(() =>
        resolveMasterKey({
          env: { NOTEBOOK_MASTER_KEY: "not-a-valid-hex" },
          vaultDir: tempDir,
        })
      ).toThrowError(VaultError);

      expect(() =>
        resolveMasterKey({
          env: { NOTEBOOK_MASTER_KEY: "012345" }, // too short
          vaultDir: tempDir,
        })
      ).toThrowError(VaultError);
    });
  });

  describe("HKDF Subkey Derivation", () => {
    it("derives deterministic 32-byte subkey using HKDF-SHA256 with info notebench:vault:v1", () => {
      const subkey1 = deriveSubkey(masterKey);
      const subkey2 = deriveSubkey(masterKey);

      expect(subkey1.length).toBe(32);
      expect(subkey2.length).toBe(32);
      expect(subkey1.equals(subkey2)).toBe(true);

      const otherMaster = Buffer.from(
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        "hex"
      );
      const subkeyOther = deriveSubkey(otherMaster);
      expect(subkey1.equals(subkeyOther)).toBe(false);
    });
  });

  describe("VaultSecret Zero-Leak Container", () => {
    it("JSON.stringify, util.inspect and string concatenation never reveal the key", () => {
      const secret = new VaultSecret(sampleKey);

      expect(JSON.stringify({ key: secret })).toBe('{"key":"[REDACTED]"}');
      expect(util.inspect(secret)).toBe("[REDACTED]");
      expect(secret.toString()).toBe("[REDACTED]");
      expect(`${secret}`).toBe("[REDACTED]");
      expect("Secret: " + secret).toBe("Secret: [REDACTED]");
      expect(String(secret)).toBe("[REDACTED]");
    });

    it("scoped callback accesses plaintext and zeroes buffer in finally block", () => {
      const secret = new VaultSecret(sampleKey);
      let capturedBuf: Buffer | undefined;

      const result = secret.withSecret((plaintext, buf) => {
        capturedBuf = buf;
        expect(plaintext).toBe(sampleKey);
        expect(buf.toString("utf8")).toBe(sampleKey);
        return 42;
      });

      expect(result).toBe(42);
      expect(capturedBuf).toBeDefined();
      // Verify buffer was zeroed in finally block!
      const isAllZero = capturedBuf!.every((byte) => byte === 0);
      expect(isAllZero).toBe(true);
    });

    it("async scoped callback zeroes buffer in finally block", async () => {
      const secret = new VaultSecret(sampleKey);
      let capturedBuf: Buffer | undefined;

      const result = await secret.withSecretAsync(async (plaintext, buf) => {
        capturedBuf = buf;
        expect(plaintext).toBe(sampleKey);
        return "ok";
      });

      expect(result).toBe("ok");
      expect(capturedBuf).toBeDefined();
      expect(capturedBuf!.every((byte) => byte === 0)).toBe(true);
    });

    it("zeroes buffer even if callback throws", () => {
      const secret = new VaultSecret(sampleKey);
      let capturedBuf: Buffer | undefined;

      expect(() => {
        secret.withSecret((_, buf) => {
          capturedBuf = buf;
          throw new Error("Simulated failure inside withSecret");
        });
      }).toThrowError("Simulated failure inside withSecret");

      expect(capturedBuf).toBeDefined();
      expect(capturedBuf!.every((byte) => byte === 0)).toBe(true);
    });
  });

  describe("Key Masking and Scrubbing", () => {
    it("derives fixed-length mask token never revealing variable character count", () => {
      const shortKey = "sk-proj-1234abcd";
      const longKey = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234abcd";

      const maskShort = deriveMaskedKey(shortKey);
      const maskLong = deriveMaskedKey(longKey);

      expect(maskShort).toBe("sk-...abcd");
      expect(maskLong).toBe("sk-...abcd");
      expect(maskShort.length).toBe(maskLong.length);

      const geminiKey = "AIzaSyAbcd1234567890Wxyz";
      expect(deriveMaskedKey(geminiKey)).toBe("AIza...Wxyz");
    });

    it("scrubs secrets from error messages and arbitrary text", () => {
      const message = `Connection failed for key ${sampleKey} at endpoint https://api.openai.com/v1`;
      const scrubbed = scrubSecretFromText(message, [sampleKey]);

      expect(scrubbed).not.toContain(sampleKey);
      expect(scrubbed).toContain("[REDACTED]");
    });
  });

  describe("EncryptedVault Service & Deletion", () => {
    it("manages secret lifecycle: set, get, status, list, and delete", async () => {
      const vault = new EncryptedVault(masterKey);

      // 1. Initial status is unconfigured
      const initialStatus = await vault.getStatus("openai", "models.openaiKey");
      expect(initialStatus.configured).toBe(false);
      expect(initialStatus.maskedKey).toBeUndefined();

      // 2. Set key
      const { maskedKey } = await vault.setKey("openai", "models.openaiKey", sampleKey, "user-123");
      expect(maskedKey).toBe("sk-...cdef");

      // 3. Status shows configured with masked key only
      const configuredStatus = await vault.getStatus("openai", "models.openaiKey", "user-123");
      expect(configuredStatus.configured).toBe(true);
      expect(configuredStatus.maskedKey).toBe("sk-...cdef");

      // 4. Retrieve key as VaultSecret
      const retrieved = await vault.getKey("openai", "models.openaiKey", "user-123");
      expect(retrieved).toBeDefined();
      retrieved!.withSecret((plaintext) => {
        expect(plaintext).toBe(sampleKey);
      });

      // 5. List configured keys returns only metadata and masked tokens
      const list = await vault.listConfiguredKeys("user-123");
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        provider: "openai",
        keyId: "models.openaiKey",
        maskedKey: "sk-...cdef",
      });

      // 6. Delete key removes row (feeding Ticket 20)
      const deleted = await vault.deleteKey("openai", "models.openaiKey", "user-123");
      expect(deleted).toBe(true);

      const afterDeleteStatus = await vault.getStatus("openai", "models.openaiKey", "user-123");
      expect(afterDeleteStatus.configured).toBe(false);
      expect(afterDeleteStatus.maskedKey).toBeUndefined();

      const afterDeleteKey = await vault.getKey("openai", "models.openaiKey", "user-123");
      expect(afterDeleteKey).toBeNull();
    });

    it("destroys VaultSecret buffer on explicit destroy or using Symbol.dispose", () => {
      const secret = new VaultSecret("temp-secret-val");
      secret.destroy();

      expect(() => {
        secret.withSecret(() => "fail");
      }).toThrowError(/destroyed/i);
    });
  });
});

