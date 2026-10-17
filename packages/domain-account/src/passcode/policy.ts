import {
  ValidationError,
  PASSCODE_MIN_LENGTH,
  PASSCODE_MAX_LENGTH,
} from "@notebench/contracts";

/**
 * Curated blocklist of common, expected, or compromised single-factor passcodes
 * per NIST SP 800-63B-4 Section 3.1.1.2.
 */
const COMMON_AND_BREACHED_PASSCODES = new Set([
  "passwordpassword",
  "password12345678",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfg",
  "qwertyuiopasdfgh",
  "correcthorsebatterystaple",
  "adminadminadmin1",
  "adminadminadminadmin",
  "letmeinletmein1",
  "welcomewelcome1",
  "notebenchadmin1",
  "masterpassword1",
  "changeme1234567",
  "iloveyouiloveyou",
  "trustnoone12345",
  "dragonballz12345",
  "administrator123",
]);

/**
 * Validates a submitted passcode against NIST SP 800-63B-4 Section 3.1.1.2 guidelines:
 * 1. Single-factor minimum length: at least 15 characters.
 * 2. Maximum length: at least 64 characters (enforced up to 128 characters).
 * 3. No composition rules: Shall not mandate specific character classes (case, numbers, symbols).
 * 4. Verifiers shall reject passcodes appearing on common or breached credential lists.
 * 5. Verifiers shall reject trivial repeating patterns (e.g. all identical characters).
 */
export function validatePasscode(passcode: unknown): string {
  if (typeof passcode !== "string") {
    throw new ValidationError("Passcode must be a string", {
      reason: "invalid_type",
    });
  }

  // NIST SP 800-63B-4: Single-factor minimum 15 characters
  if (passcode.length < PASSCODE_MIN_LENGTH) {
    throw new ValidationError(
      `Passcode must be at least ${PASSCODE_MIN_LENGTH} characters long per NIST SP 800-63B-4 guidelines (got ${passcode.length})`,
      {
        minimumLength: PASSCODE_MIN_LENGTH,
        receivedLength: passcode.length,
        guideline: "NIST SP 800-63B-4 Section 3.1.1.2",
      }
    );
  }

  // Maximum length ceiling
  if (passcode.length > PASSCODE_MAX_LENGTH) {
    throw new ValidationError(
      `Passcode exceeds maximum allowed length of ${PASSCODE_MAX_LENGTH} characters (got ${passcode.length})`,
      {
        maximumLength: PASSCODE_MAX_LENGTH,
        receivedLength: passcode.length,
      }
    );
  }

  // Check against breached / common blocklist (case-insensitive check)
  const normalized = passcode.trim().toLowerCase();
  if (COMMON_AND_BREACHED_PASSCODES.has(normalized)) {
    throw new ValidationError(
      "The specified passcode is commonly used or appears in known breach lists and cannot be chosen.",
      {
        reason: "common_or_breached_credential",
        guideline: "NIST SP 800-63B-4 Section 3.1.1.2",
      }
    );
  }

  // Check for trivial repeating character sequence (e.g. 'aaaaaaaaaaaaaaaa')
  const firstChar = passcode[0];
  if (firstChar && passcode.split("").every((c) => c === firstChar)) {
    throw new ValidationError(
      "Passcodes consisting of a single repeated character are not permitted.",
      {
        reason: "trivial_repeated_pattern",
      }
    );
  }

  return passcode;
}
