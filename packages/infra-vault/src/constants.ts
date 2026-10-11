export const VAULT_CONSTANTS = {
  ALGORITHM: "aes-256-gcm",
  HKDF_INFO: "notebench:vault:v1",
  SCHEMA_VERSION: 1,
  IV_BYTE_LENGTH: 12, // 96 bits
  TAG_BYTE_LENGTH: 16, // 128 bits
  KEY_BYTE_LENGTH: 32, // 256 bits (32 bytes)
  DEFAULT_MASTER_KEY_ENV: "NOTEBOOK_MASTER_KEY",
  DEFAULT_VAULT_DIR: ".notebook/vault",
  DEFAULT_MASTER_KEY_FILE: "master.key",
  DEFAULT_KEYS_STORAGE_FILE: "keys.enc",
} as const;
