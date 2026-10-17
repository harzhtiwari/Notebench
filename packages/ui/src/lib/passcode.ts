/**
 * Passcode policy for the owner setup flow (parent ticket 01, §3).
 *
 * Single-factor minimum 15 characters, maximum 128 (satisfies "at least 64"),
 * no composition rules, per NIST SP 800-63B-4 §3.1.1.2. The passcode is
 * optional: an empty value means zero-auth single-user mode and is valid.
 *
 * Common/breached-list rejection stays server-side; the form surfaces that
 * failure through the `error` prop, not through this helper.
 */
export const PASSCODE_MIN_LENGTH = 15;
export const PASSCODE_MAX_LENGTH = 128;

/** Returns an error message, or null when the value satisfies the policy. */
export function validatePasscode(value: string): string | null {
  if (value.length === 0) {
    return null;
  }
  if (value.length < PASSCODE_MIN_LENGTH) {
    return `Passcode must be at least ${PASSCODE_MIN_LENGTH} characters long.`;
  }
  if (value.length > PASSCODE_MAX_LENGTH) {
    return `Passcode must be at most ${PASSCODE_MAX_LENGTH} characters long.`;
  }
  return null;
}
