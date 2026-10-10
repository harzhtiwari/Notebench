import { describe, expect, it } from "vitest";
import { WebReaderService } from "./web-reader.js";

describe("WebReaderService (Seam 2 - RED phase)", () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Article Title - Blog</title>
      <meta property="og:title" content="Engineering High Performance Systems">
      <meta name="author" content="Jane Doe">
      <meta name="description" content="A comprehensive analysis of distributed storage.">
    </head>
    <body>
      <header><nav><a href="/home">Home</a></nav></header>
      <article>
        <h1>Engineering High Performance Systems</h1>
        <p class="byline">By Jane Doe</p>
        <p>Distributed consensus is difficult to achieve under network partitions.</p>
        <h2>Benchmarking Tables</h2>
        <table>
          <thead>
            <tr><th>Engine</th><th>Throughput (ops/sec)</th></tr>
          </thead>
          <tbody>
            <tr><td>SQLite</td><td>150,000</td></tr>
            <tr><td>Postgres</td><td>45,000</td></tr>
          </tbody>
        </table>
        <p>For more details, see <a href="/docs/guide">the guide</a>.</p>
        <script>alert("malicious script");</script>
      </article>
      <footer><p>Copyright 2026</p></footer>
    </body>
    </html>
  `;

  it("extracts clean metadata from open-graph, meta tags, and title cascade", () => {
    const reader = new WebReaderService();
    const result = reader.extract(sampleHtml, "https://example.com/posts/systems");

    expect(result.metadata.title).toBe("Engineering High Performance Systems");
    expect(result.metadata.author).toBe("Jane Doe");
    expect(result.metadata.description).toBe("A comprehensive analysis of distributed storage.");
    expect(result.metadata.url).toBe("https://example.com/posts/systems");
  });

  it("converts article body to clean GitHub Flavored Markdown preserving tables and structure", () => {
    const reader = new WebReaderService();
    const result = reader.extract(sampleHtml, "https://example.com/posts/systems");

    expect(result.markdown).toContain("Engineering High Performance Systems");
    expect(result.markdown).toContain("Distributed consensus is difficult");
    // Verify table structure with pipes
    expect(result.markdown).toMatch(/\|.*Engine.*\|.*Throughput.*\|/);
    expect(result.markdown).toMatch(/\|.*SQLite.*\|.*150,000.*\|/);
    // Verify script tags are stripped
    expect(result.markdown).not.toContain("alert(");
    expect(result.markdown).not.toContain("<script>");
  });

  it("resolves relative URLs to absolute URLs using target URL base", () => {
    const reader = new WebReaderService();
    const result = reader.extract(sampleHtml, "https://example.com/posts/systems");

    expect(result.markdown).toContain("https://example.com/docs/guide");
  });

  it("handles empty or unparseable HTML without crashing", () => {
    const reader = new WebReaderService();
    const result = reader.extract("", "https://example.com");

    expect(result.markdown).toBe("");
    expect(result.metadata.title).toBe("");
  });

  it("extracts rich metadata from JSON-LD schema cascade when OpenGraph is absent", () => {
    const jsonLdHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "headline": "Deep Research in Hybrid Search",
          "author": {
            "@type": "Person",
            "name": "Dr. Alan Turing"
          },
          "datePublished": "2026-05-15T12:00:00Z",
          "description": "Exploration of reciprocal rank fusion.",
          "publisher": {
            "@type": "Organization",
            "name": "Turing Institute"
          }
        }
        </script>
      </head>
      <body>
        <article><p>Article content about RRF algorithms.</p></article>
      </body>
      </html>
    `;
    const reader = new WebReaderService();
    const result = reader.extract(jsonLdHtml, "https://turing.org/rrf");

    expect(result.metadata.title).toBe("Deep Research in Hybrid Search");
    expect(result.metadata.author).toBe("Dr. Alan Turing");
    expect(result.metadata.description).toBe("Exploration of reciprocal rank fusion.");
    expect(result.metadata.siteName).toBe("Turing Institute");
    expect(result.metadata.publishedTime).toBe("2026-05-15T12:00:00.000Z");
  });

  it("sanitizes malicious HTML payloads (XSS smuggling) using sanitize-html", () => {
    const xssHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Clean Article</title></head>
      <body>
        <article>
          <p>Normal text <span onmouseover="stealCookies()">hover</span></p>
          <img src="https://example.com/pic.jpg" onerror="alert('hacked')" />
          <a href="javascript:alert(1)">Click me</a>
          <iframe src="https://attacker.com"></iframe>
        </article>
      </body>
      </html>
    `;
    const reader = new WebReaderService();
    const result = reader.extract(xssHtml, "https://example.com/safe");

    expect(result.markdown).not.toContain("onmouseover");
    expect(result.markdown).not.toContain("stealCookies");
    expect(result.markdown).not.toContain("onerror");
    expect(result.markdown).not.toContain("alert('hacked')");
    expect(result.markdown).not.toContain("javascript:");
    expect(result.markdown).not.toContain("<iframe");
  });

  it("normalizes non-standard dates to ISO-8601 UTC string", () => {
    const htmlWithMessyDate = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Article with unformatted date</title>
        <meta property="article:published_time" content="2026-05-15 14:30:00">
      </head>
      <body><article><p>Content</p></article></body>
      </html>
    `;
    const reader = new WebReaderService();
    const result = reader.extract(htmlWithMessyDate, "https://example.com/date-test");

    expect(result.metadata.publishedTime).toBeDefined();
    expect(result.metadata.publishedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("extracts and resolves favicon and canonicalUrl", () => {
    const htmlWithIcons = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Icon Article</title>
        <link rel="icon" href="/static/favicon.ico">
        <link rel="canonical" href="/canonical-page">
      </head>
      <body><article><p>Content</p></article></body>
      </html>
    `;
    const reader = new WebReaderService();
    const result = reader.extract(htmlWithIcons, "https://example.com/sub/page");

    expect(result.metadata.favicon).toBe("https://example.com/static/favicon.ico");
    expect(result.metadata.canonicalUrl).toBe("https://example.com/canonical-page");
  });

  it("prevents HTML injection from malicious targetUrl in base tag", () => {
    const reader = new WebReaderService();
    const maliciousUrl = 'https://example.com/"><script>alert("pwn")</script>';
    const result = reader.extract("<article><p>Hello</p></article>", maliciousUrl);

    expect(result.markdown).not.toContain('<script>alert("pwn")</script>');
  });
});
