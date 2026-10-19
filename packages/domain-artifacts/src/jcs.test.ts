import { describe, it, expect } from "vitest";
import { canonicalizeJson } from "./jcs.js";

/**
RED suite for the hand-rolled RFC 8785 (JCS) canonicalizer.
No npm `canonicalize` dependency: string/number escaping delegates to
JSON.stringify, object keys sort as UTF-16 code units, no normalization.
(Research: docs/research/2026-10-15/02-storage-health-release-baseline.md §12;
RFC 8785 https://www.rfc-editor.org/rfc/rfc8785.txt)
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
    expect(() => canonicalizeJson(NaN)).toThrow(TypeError);
    expect(() => canonicalizeJson(Infinity)).toThrow(TypeError);
    expect(() => canonicalizeJson({ n: -Infinity })).toThrow(TypeError);
  });

  it("preserves Unicode as-is with no normalization", () => {
    // U+00E9 as a single code point stays literal (JSON.stringify behaviour).
    expect(canonicalizeJson({ t: "caf\u{E9}" })).toBe('{"t":"caf\u{E9}"}');
    // Composed vs decomposed forms are distinct inputs with distinct outputs.
    expect(canonicalizeJson({ t: "\u{E9}" })).not.toBe(canonicalizeJson({ t: "e\u{301}" }));
  });

  it("rejects lone surrogates per RFC 8785 §3.2.2.2", () => {
    expect(() => canonicalizeJson({ t: "\u{D800}" })).toThrow(TypeError);
    expect(() => canonicalizeJson({ t: "a\u{DC00}" })).toThrow(TypeError);
    // A well-formed surrogate pair is accepted.
    expect(canonicalizeJson({ t: "\u{1F600}" })).toBe('{"t":"\u{1F600}"}');
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

/**
Interprets a 64-bit IEEE 754 hex word (RFC 8785 Appendix B) as a JS Number.
*/
function numberFromIeee754Hex(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${hex}`), false);
  return view.getFloat64(0, false);
}

describe("RFC 8785 official test vectors", () => {
  it("matches the Section 3.2.2 end-to-end canonicalization sample", () => {
    const sample = {
      numbers: [
        // RFC §3.2.2 sample: the 17-digit decimal 333333333.33333329 parses to this double.
        Number("333333333.33333329"),
        1e30,
        4.5,
        2e-3,
        0.000000000000000000000000001,
      ],
      string: "\u{20AC}$\u{F}\nA'B\"\\\\\"/",
      literals: [null, true, false],
    };

    expect(canonicalizeJson(sample)).toBe(
      String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`
    );
  });

  it("sorts Section 3.2.3 mixed-Unicode property names in UTF-16 code-unit order", () => {
    const input = {
      "\u{20AC}": "Euro Sign",
      "\r": "Carriage Return",
      "\u{FB33}": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\u{1F600}": "Emoji: Grinning Face",
      "\u{80}": "Control",
      "\u{F6}": "Latin Small Letter O With Diaeresis",
    };

    // Expected order from RFC 8785 §3.2.3: U+000D, U+0031, U+0080, U+00F6,
    // U+20AC, U+1F600 (surrogate pair), U+FB33. U+0080 and above are emitted
    // as-is (not ASCII controls); U+000D is written as the "\r" escape.
    const expected =
      "{" +
      String.raw`"\r":"Carriage Return",` +
      '"1":"One",' +
      '"\u{80}":"Control",' +
      '"\u{F6}":"Latin Small Letter O With Diaeresis",' +
      '"\u{20AC}":"Euro Sign",' +
      '"\u{1F600}":"Emoji: Grinning Face",' +
      '"\u{FB33}":"Hebrew Letter Dalet With Dagesh"' +
      "}";

    expect(canonicalizeJson(input)).toBe(expected);
  });

  // RFC 8785 Appendix B, Table 1. `null` marks values that MUST error (NaN/Infinity).
  const APPENDIX_B_VECTORS: readonly (readonly [string, string | null])[] = [
    ["0000000000000000", "0"], // Zero
    ["8000000000000000", "0"], // Minus zero
    ["0000000000000001", "5e-324"], // Min pos number
    ["8000000000000001", "-5e-324"], // Min neg number
    ["7fefffffffffffff", "1.7976931348623157e+308"], // Max pos number
    ["ffefffffffffffff", "-1.7976931348623157e+308"], // Max neg number
    ["4340000000000000", "9007199254740992"], // Max pos int
    ["c340000000000000", "-9007199254740992"], // Max neg int
    ["4430000000000000", "295147905179352830000"], // ~2**68
    ["7fffffffffffffff", null], // NaN
    ["7ff0000000000000", null], // Infinity
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"],
    ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"],
    ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"],
    ["becbf647612f3696", "-0.0000033333333333333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"], // Round to even
  ];

  it("matches every Appendix B number serialization sample", () => {
    expect(APPENDIX_B_VECTORS).toHaveLength(26);
    for (const [hex, expected] of APPENDIX_B_VECTORS) {
      const value = numberFromIeee754Hex(hex);
      if (expected === null) {
        expect(() => canonicalizeJson(value), `hex ${hex} must be rejected`).toThrow(
          TypeError
        );
      } else {
        expect(canonicalizeJson(value), `hex ${hex}`).toBe(expected);
      }
    }
  });
});

/**
Deterministic PRNG (mulberry32) — no extra test dependencies.
*/
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // eslint-disable-next-line unicorn/prefer-math-trunc -- mulberry32 requires ToInt32 wrap-around; Math.trunc is not equivalent
    state |= 0;
    // eslint-disable-next-line unicorn/prefer-math-trunc -- mulberry32 requires ToInt32 wrap-around; Math.trunc is not equivalent
    state = (state + 0x6D_2B_79_F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type JsonLeaf = string | number | boolean | null;
type JsonTree = JsonLeaf | JsonTree[] | { [key: string]: JsonTree };

const LEAF_POOL: JsonLeaf[] = ["a", "Z", "", "caf\u{E9}", 0, -0, 1.5, 1e30, true, false, null];

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
  const obj: Record<string, JsonTree> = {};
  for (let i = 0; i < count; i++) {
    const key = keys[Math.floor(rand() * keys.length)];
    if (key === undefined) {
      throw new Error("randomTree invariant violated: key index out of range");
    }
    obj[key] = randomTree(rand, depth - 1);
  }
  return obj;
}

/**
Shuffles insertion order by rebuilding objects with rotated key order.
*/
function shuffleKeys(value: JsonTree, rand: () => number): JsonTree {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, rand));
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    const offset = Math.floor(rand() * (keys.length + 1));
    const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];
    const out: Record<string, JsonTree> = {};
    for (const k of rotated) {
      out[k] = shuffleKeys((value as Record<string, JsonTree>)[k] as JsonTree, rand);
    }
    return out;
  }
  return value;
}

describe("JCS canonicalizer property-based random-tree checks", () => {
  it("is stable under key reordering and round-trips through JSON.parse (200 trees)", () => {
    const rand = mulberry32(0x12_C0_FF_33);
    for (let i = 0; i < 200; i++) {
      const tree = randomTree(rand, 4);
      const shuffled = shuffleKeys(tree, rand);
      const base = canonicalizeJson(tree);
      // Key order never affects the canonical form.
      expect(canonicalizeJson(shuffled)).toBe(base);
      // Canonical form always parses back to a deep-equal value.
      // eslint-disable-next-line unicorn/prefer-structured-clone -- JSON round-trip deliberately normalizes -0 to 0 (JCS §3.2.2.3); structuredClone preserves -0 and toEqual distinguishes them
      expect(JSON.parse(base)).toEqual(JSON.parse(JSON.stringify(tree)));
    }
  });
});
