import util from "node:util";

const REDACTED = "[REDACTED]";

/**
 * Zero-Leak container encapsulating sensitive secrets.
 * Prevents implicit string concatenation, JSON serialization, and logging leaks.
 * Plaintext is only accessible via scoped callbacks that zero the memory buffer in finally.
 */
export class VaultSecret {
  private buffer: Buffer | null;
  private isDestroyed = false;

  constructor(secret: string | Buffer) {
    if (Buffer.isBuffer(secret)) {
      this.buffer = Buffer.from(secret);
    } else if (typeof secret === "string") {
      this.buffer = Buffer.from(secret, "utf8");
    } else {
      throw new TypeError("VaultSecret requires string or Buffer input");
    }
  }

  /**
   * Scoped synchronous callback giving ephemeral access to plaintext string and buffer.
   * Immediately zeroes the memory buffer in the finally block.
   */
  public withSecret<T>(callback: (plaintext: string, buffer: Buffer) => T): T {
    this.ensureNotDestroyed();
    if (!this.buffer) {
      throw new Error("VaultSecret buffer is unavailable");
    }

    const tempBuf = Buffer.from(this.buffer);
    try {
      return callback(tempBuf.toString("utf8"), tempBuf);
    } finally {
      tempBuf.fill(0);
    }
  }

  /**
   * Scoped asynchronous callback giving ephemeral access to plaintext string and buffer.
   * Immediately zeroes the memory buffer in the finally block after promise completion.
   */
  public async withSecretAsync<T>(
    callback: (plaintext: string, buffer: Buffer) => Promise<T>
  ): Promise<T> {
    this.ensureNotDestroyed();
    if (!this.buffer) {
      throw new Error("VaultSecret buffer is unavailable");
    }

    const tempBuf = Buffer.from(this.buffer);
    try {
      return await callback(tempBuf.toString("utf8"), tempBuf);
    } finally {
      tempBuf.fill(0);
    }
  }

  /**
   * Securely zeroes the internal secret buffer and invalidates this instance.
   */
  public destroy(): void {
    if (this.buffer) {
      this.buffer.fill(0);
      this.buffer = null;
    }
    this.isDestroyed = true;
  }

  public [Symbol.dispose](): void {
    this.destroy();
  }

  public toJSON(): string {
    return REDACTED;
  }

  public toString(): string {
    return REDACTED;
  }

  public valueOf(): string {
    return REDACTED;
  }

  public [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  public [util.inspect.custom](): string {
    return REDACTED;
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed || !this.buffer) {
      throw new Error("VaultSecret has already been destroyed");
    }
  }
}
