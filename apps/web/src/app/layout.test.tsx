// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import RootLayout from "./layout.js";

describe("root layout theme boot (no flash before hydration)", () => {
  it("inlines a pre-paint theme boot script before the font stylesheet", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>content</main>
      </RootLayout>
    );

    // The script reads the persisted preference and sets data-theme on <html>
    // during HTML parsing, before the first paint. React may hoist the
    // preconnect hints above it; the hard requirements are: inside <head>,
    // before the render-blocking stylesheet, before the body.
    expect(html).toContain("notebench_theme");
    expect(html).toContain("prefers-color-scheme: dark");

    const scriptAt = html.indexOf("notebench_theme");
    const stylesheetAt = html.indexOf("fonts.googleapis.com/css2");
    const bodyAt = html.indexOf("<body");
    expect(scriptAt).toBeGreaterThan(-1);
    expect(stylesheetAt).toBeGreaterThan(scriptAt);
    expect(bodyAt).toBeGreaterThan(scriptAt);
  });
});
