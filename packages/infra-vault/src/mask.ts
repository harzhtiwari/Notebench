/**
 * Derives a fixed-length masked key display token.
 * Prevents information leakage regarding the variable character length of underlying secrets.
 * Examples: 'sk-...abcd' or 'AIza...1234'.
 */
export function deriveMaskedKey(key: string): string {
  if (!key || typeof key !== "string" || key.length < 4) {
    return "****...****";
  }

  const suffix = key.slice(-4);

  if (key.startsWith("sk-")) {
    return `sk-...${suffix}`;
  }

  if (key.startsWith("AIza")) {
    return `AIza...${suffix}`;
  }

  return `key-...${suffix}`;
}

/**
 * Scrubs any occurrence of known secret strings from arbitrary text or error messages.
 */
export function scrubSecretFromText(
  text: string,
  secrets: readonly (string | undefined | null)[]
): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  let result = text;
  for (const secret of secrets) {
    if (secret && typeof secret === "string" && secret.trim().length > 0) {
      result = result.replaceAll(secret, "[REDACTED]");
    }
  }

  return result;
}
