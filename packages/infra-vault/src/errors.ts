import { NotebookError, type NotebookErrorCode } from "@notebench/contracts";

export type VaultErrorCategory =
  | "TAMPERED_CIPHERTEXT"
  | "INVALID_MASTER_KEY"
  | "AAD_MISMATCH"
  | "KEY_NOT_FOUND"
  | "STORAGE_ERROR"
  | "VALIDATION_ERROR";

/**
 * Categorised Vault error class preserving prototype chain and strict NotebookError contracts.
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
      case "TAMPERED_CIPHERTEXT":
      case "AAD_MISMATCH":
        this.code = "INVARIANCE_VIOLATION";
        this.statusCode = 409;
        break;
      case "INVALID_MASTER_KEY":
        this.code = "UNAUTHORIZED";
        this.statusCode = 401;
        break;
      case "KEY_NOT_FOUND":
        this.code = "NOT_FOUND";
        this.statusCode = 404;
        break;
      case "VALIDATION_ERROR":
      default:
        this.code = "VALIDATION_ERROR";
        this.statusCode = 400;
        break;
    }
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      category: this.category,
    };
  }
}
