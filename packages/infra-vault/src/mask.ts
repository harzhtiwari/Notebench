/**
Derives a fixed-length (always 10 characters) masked key display token.
Every branch pads/truncates to the same width so neither the secret's length
nor its prefix style leaks through mask length.
Examples: 'sk-...abcd', 'AIz...Wxyz', 'key...1234'.
*/
export function deriveMaskedKey(key: string): string {
  if (!key || typeof key !== "string" || key.length < 4) {
    return "***...****";
  }

  const suffix = key.slice(-4);

  if (key.startsWith("sk-")) {
    return `sk-...${suffix}`;
  }

  if (key.startsWith("AIza")) {
    // Truncated to a 3-char prefix ('AIz') so this branch matches 'sk-...' width.
    return `AIz...${suffix}`;
  }

  return `key...${suffix}`;
}

/**
Scrubs any occurrence of known secret strings from arbitrary text or error messages.
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
