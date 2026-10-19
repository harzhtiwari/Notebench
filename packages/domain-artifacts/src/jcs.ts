/**
Hand-rolled RFC 8785 JSON Canonicalization Scheme (JCS) serializer.

Zero-dependency: string/number escaping delegates to `JSON.stringify`
(ECMAScript semantics, matching RFC 8785 §3.2.2), object keys sort as
raw UTF-16 code units with shorter-first ordering (§3.2.3), and Unicode
is preserved as-is with no normalization (§3.1). Non-I-JSON inputs
(undefined, bigint, function, symbol, non-finite numbers, lone
surrogates) throw `TypeError` instead of silently coercing.

Reference: https://www.rfc-editor.org/rfc/rfc8785.txt (June 2020).
*/

/**
Serializes any I-JSON value to its RFC 8785 canonical form (no whitespace).

@throws A TypeError when the value is not I-JSON serializable.
*/
export function canonicalizeJson(value: unknown): string {
  return serializeValue(value);
}

function serializeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  if (typeof value === "string") {
    return serializeString(value);
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (Array.isArray(value)) {
    // Arrays keep element order (§3.2.3); elements canonicalize recursively.
    return `[${value.map((entry) => serializeValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return serializeObject(value as Record<string, unknown>);
  }
  throw new TypeError(
    `RFC 8785 canonicalization requires I-JSON input; received ${describeType(value)}`
  );
}

function serializeString(text: string): string {
  assertNoLoneSurrogates(text);
  // Delegates escaping to ECMAScript JSON.stringify semantics (§3.2.2.2):
  // controls as \b \t \n \f \r or lowercase \uhhhh, only \\ and \" escaped.
  return JSON.stringify(text);
}

function serializeNumber(num: number): string {
  // NaN and ±Infinity are not valid I-JSON and MUST error (§3.2.2.3).
  if (!Number.isFinite(num)) {
    throw new TypeError(
      "RFC 8785 canonicalization rejects non-finite numbers (NaN, Infinity)"
    );
  }
  // Shortest round-trip decimal form per ECMA-262 §7.1.12.1 Note 2
  // (-0 → "0", 1E30 → "1e+30", 4.50 → "4.5").
  return JSON.stringify(num);
}

function serializeObject(obj: Record<string, unknown>): string {
  // Sort on raw unescaped names as UTF-16 code units, shorter-first (§3.2.3).
  const keys = Object.keys(obj).toSorted(compareUtf16CodeUnits);
  const parts = keys.map(
    (key) => `${serializeString(key)}:${serializeValue(obj[key])}`
  );
  return `{${parts.join(",")}}`;
}

/**
Unsigned UTF-16 code-unit comparison with shorter-first ordering.
Matches RFC 8785 §3.2.3 and the Appendix A `Object.keys(o).sort()` reference
for BMP-only names; explicit (rather than default sort) so the ordering
rule is visible and intentional. JS relational operators compare strings by
UTF-16 code-unit sequence with shorter strings first — exactly the required order.
*/
function compareUtf16CodeUnits(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
Rejects lone surrogates, which MUST cause an error (§3.2.2.2).
*/
function assertNoLoneSurrogates(text: string): void {
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint >= 0xD8_00 && codePoint <= 0xDF_FF) {
      throw new TypeError(
        "RFC 8785 canonicalization rejects strings with lone surrogates"
      );
    }
    if (codePoint > 0xFF_FF) {
      // Valid surrogate pair: skip its low-surrogate half.
      index++;
    }
  }
}

function describeType(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  return typeof value === "bigint" ? "bigint" : typeof value;
}
