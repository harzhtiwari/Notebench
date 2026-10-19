import { describe, expect, it } from "vitest";

import { selectTokenLintTargets } from "./lint-tokens.js";

describe("lint:tokens target selection", () => {
  it("keeps only app pages, sorted for a deterministic command line", () => {
    expect(
      selectTokenLintTargets(["ui-preview.html", "index.html", "setup.html"])
    ).toEqual(["index.html", "setup.html", "ui-preview.html"]);
  });

  it("drops Next.js framework chrome (404 and underscore-prefixed internal pages)", () => {
    expect(
      selectTokenLintTargets([
        "404.html",
        "_not-found.html",
        "_not-found/index.html",
        "index.html",
      ])
    ).toEqual(["index.html"]);
  });

  it("ignores non-HTML assets", () => {
    expect(
      selectTokenLintTargets([
        "index.html",
        "index.txt",
        "_next/static/chunk.js",
        "styles.css",
      ])
    ).toEqual(["index.html"]);
  });

  it("handles Windows-style separators", () => {
    expect(
      selectTokenLintTargets(["setup\\index.html", "index.html", "_not-found\\index.html"])
    ).toEqual(["index.html", "setup\\index.html"]);
  });

  it("returns an empty list for an empty directory listing", () => {
    expect(selectTokenLintTargets([])).toEqual([]);
  });
});
