import { describe, expect, it } from "vitest";
import { generateStaticParams } from "./page.js";

/**
Ticket 06: the single catch-all entry prerenders the root shell so the
static export emits `out/index.html`. The daemon fallback serves that
shell for unknown non-API paths (deep links hydrate to the right view via
AppRoot's live-URL adoption). Stub screens stay deleted: only `/` and the
functional `/setup` are prerendered.
*/
describe("ticket 06: catch-all prerenders the root shell", () => {
  it("emits the empty slug so static export produces out/index.html", () => {
    expect(generateStaticParams()).toContainEqual({ slug: [] });
  });

  it("keeps the setup entry prerendered", () => {
    expect(generateStaticParams()).toContainEqual({ slug: ["setup"] });
  });
});
