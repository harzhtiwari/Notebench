export { VAULT_CONSTANTS } from "./constants.js";
export { VaultError, type VaultErrorCategory } from "./errors.js";
export { VaultSecret } from "./secret.js";
export { deriveMaskedKey, scrubSecretFromText } from "./mask.js";
export {
  encryptSecret,
  decryptSecret,
  deriveSubkey,
  serializeAad,
  type AadPayload,
  type VaultEnvelope,
} from "./crypto.js";
export {
  resolveMasterKey,
  type ResolveMasterKeyOptions,
  type MasterKeyResult,
} from "./master-key.js";
export {
  EncryptedVault,
  MemoryVaultStorage,
  type VaultStorage,
  type VaultKeyRecord,
  type KeyStatusResult,
} from "./vault.js";
