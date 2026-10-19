import { NotebookError, type NotebookErrorCode } from "@notebench/contracts";

export type VaultErrorCategory =
  // Wrong-AAD context substitutions are deliberately folded into this category:
  // AES-GCM authenticates AAD jointly with the ciphertext, so a wrong AAD is
  // cryptographically indistinguishable from tampering.
  | "TAMPERED_CIPHERTEXT"
  | "INVALID_MASTER_KEY"
  | "KEY_NOT_FOUND"
  | "STORAGE_ERROR"
  | "VALIDATION_ERROR";

/**
Categorised Vault error class preserving prototype chain and strict NotebookError contracts.
*/
export class VaultError extends NotebookError {
  readonly code: NotebookErrorCode;
  readonly statusCode: number;
  readonly category: VaultErrorCategory;

  constructor(
    message: string,
    category: VaultErrorCategory,
    details?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, details, options);
    this.category = category;

    switch (category) {
      case "TAMPERED_CIPHERTEXT": {
        this.code = "INVARIANCE_VIOLATION";
        this.statusCode = 409;
        break;
      }
      case "INVALID_MASTER_KEY": {
        this.code = "UNAUTHORIZED";
        this.statusCode = 401;
        break;
      }
      case "KEY_NOT_FOUND": {
        this.code = "NOT_FOUND";
        this.statusCode = 404;
        break;
      }
      case "STORAGE_ERROR": {
        // Vault storage I/O failure: an internal fault, not bad client input.
        // 500-class, mirroring the server's internal-error convention.
        this.code = "INVARIANCE_VIOLATION";
        this.statusCode = 500;
        break;
      }
      default: {
        this.code = "VALIDATION_ERROR";
        this.statusCode = 400;
        break;
      }
    }
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      category: this.category,
    };
  }
}
