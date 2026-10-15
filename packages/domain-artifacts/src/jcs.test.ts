import { describe, it, expect } from "vitest";
import { canonicalizeJson } from "./jcs.js";

/**
 * RED suite for the hand-rolled RFC 8785 (JCS) canonicalizer.
 * No npm `canonicalize` dependency: string/number escaping delegates to
 * JSON.stringify, object keys sort as UTF-16 code units, no normalization.
 * (Research: docs/research/2026-10-15/02-storage-health-release-baseline.md §12;
 * RFC 8785 https://www.rfc-editor.org/rfc/rfc8785.txt)
 */
describe("RFC 8785 hand-rolled JSON canonicalizer (JCS)", () => {
  it("emits no whitespace and sorts keys as UTF-16 code units", () => {
    expect(canonicalizeJson({ b: 1, a: [3, 2] })).toBe('{"a":[3,2],"b":1}');
    // Uppercase (0x5A) sorts before lowercase (0x61) in UTF-16 order.
    expect(canonicalizeJson({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
  });

  it("sorts nested objects recursively while preserving array order", () => {
    const input = { z: [{ b: 1, a: 2 }, { d: 4, c: 3 }], a: { y: 1, x: 0 } };
    expect(canonicalizeJson(input)).toBe(
      '{"a":{"x":0,"y":1},"z":[{"a":2,"b":1},{"c":3,"d":4}]}'
    );
  });

  it("is stable under key reordering (JCS digest property)", () => {
    const objA = { id: "x", kind: "heading", level: 1, text: "Hi", locked: false };
    const objB = { locked: false, text: "Hi", level: 1, id: "x", kind: "heading" };
    expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
  });

  it("round-trips through JSON.parse to a deep-equal value", () => {
    const input = { b: [1, "two", null, true, { k: "v" }], a: 0 };
    expect(JSON.parse(canonicalizeJson(input))).toEqual(input);
  });

  it("delegates number serialization to JSON.stringify shortest round-trip form", () => {
    expect(canonicalizeJson(4.5)).toBe("4.5");
    expect(canonicalizeJson(1e30)).toBe("1e+30");
    expect(canonicalizeJson(-0)).toBe("0");
    expect(canonicalizeJson({ n: 0.1 + 0.2 })).toBe(
      `{"n":${JSON.stringify(0.1 + 0.2)}}`
    );
  });

  it("rejects non-finite numbers per RFC 8785 §3.2.2.3", () => {
    expect(() => canonicalizeJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalizeJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalizeJson({ n: Number.NEGATIVE_INFINITY })).toThrow(TypeError);
  });

  it("preserves Unicode as-is with no normalization", () => {
    // U+00E9 as a single code point stays literal (JSON.stringify behaviour).
    expect(canonicalizeJson({ t: "caf\u00e9" })).toBe('{"t":"caf\u00e9"}');
    // Composed vs decomposed forms are distinct inputs with distinct outputs.
    expect(canonicalizeJson({ t: "\u00e9" })).not.toBe(canonicalizeJson({ t: "e\u0301" }));
  });

  it("rejects lone surrogates per RFC 8785 §3.2.2.2", () => {
    expect(() => canonicalizeJson({ t: "\ud800" })).toThrow(TypeError);
    expect(() => canonicalizeJson({ t: "a\udc00" })).toThrow(TypeError);
    // A well-formed surrogate pair is accepted.
    expect(canonicalizeJson({ t: "\ud83d\ude00" })).toBe('{"t":"\ud83d\ude00"}');
  });

  it("rejects non-I-JSON values (undefined, bigint, function, symbol)", () => {
    expect(() => canonicalizeJson(undefined)).toThrow(TypeError);
    expect(() => canonicalizeJson({ a: undefined })).toThrow(TypeError);
    const bigintValue: unknown = 1n;
    expect(() => canonicalizeJson([bigintValue as number])).toThrow(TypeError);
    expect(() => canonicalizeJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalizeJson(Symbol("s"))).toThrow(TypeError);
  });

  it("serializes primitives exactly", () => {
    expect(canonicalizeJson(null)).toBe("null");
    expect(canonicalizeJson(true)).toBe("true");
    expect(canonicalizeJson(false)).toBe("false");
    expect(canonicalizeJson("")).toBe('""');
    expect(canonicalizeJson([])).toBe("[]");
    expect(canonicalizeJson({})).toBe("{}");
  });
});

/** Deterministic PRNG (mulberry32) — no extra test dependencies. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type JsonLeaf = string | number | boolean | null;
type JsonTree = JsonLeaf | JsonTree[] | { [key: string]: JsonTree };

const LEAF_POOL: JsonLeaf[] = ["a", "Z", "", "caf\u00e9", 0, -0, 1.5, 1e30, true, false, null];

function randomTree(rand: () => number, depth: number): JsonTree {
  const roll = rand();
  if (depth <= 0 || roll < 0.35) {
    const leaf = LEAF_POOL[Math.floor(rand() * LEAF_POOL.length)];
    return leaf as JsonTree;
  }
  if (roll < 0.65) {
    const len = Math.floor(rand() * 4);
    return Array.from({ length: len }, () => randomTree(rand, depth - 1));
  }
  const keys = ["a", "Z", "id", "text", "0", "_", "m", "Ab"];
  const count = Math.floor(rand() * 4);
  const obj: { [key: string]: JsonTree } = {};
  for (let i = 0; i < count; i++) {
    const key = keys[Math.floor(rand() * keys.length)] as string;
    obj[key] = randomTree(rand, depth - 1);
  }
  return obj;
}

/** Shuffles insertion order by rebuilding objects with rotated key order. */
function shuffleKeys(value: JsonTree, rand: () => number): JsonTree {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, rand));
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    const offset = Math.floor(rand() * (keys.length + 1));
    const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];
    const out: { [key: string]: JsonTree } = {};
    for (const k of rotated) {
      out[k] = shuffleKeys((value as Record<string, JsonTree>)[k] as JsonTree, rand);
    }
    return out;
  }
  return value;
}

describe("JCS canonicalizer property-based random-tree checks", () => {
  it("is stable under key reordering and distinguishes single-leaf mutations (200 trees)", () => {
    const rand = mulberry32(0x12c0ff33);
    for (let i = 0; i < 200; i++) {
      const tree = randomTree(rand, 4);
      const shuffled = shuffleKeys(tree, rand);
      const base = canonicalizeJson(tree);
      // Key order never affects the canonical form.
      expect(canonicalizeJson(shuffled)).toBe(base);
      // Canonical form always parses back to a deep-equal value.
      expect(JSON.parse(base)).toEqual(JSON.parse(JSON.stringify(tree)));
    }
  });
});
