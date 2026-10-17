import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
// @ts-expect-error - Joplin turndown plugin has loose type declarations
import { gfm } from "@joplin/turndown-plugin-gfm";
import sanitizeHtml from "sanitize-html";

export interface WebArticleMetadata {
  title: string;
  author: string;
  description: string;
  url: string;
  byline?: string | undefined;
  siteName?: string | undefined;
  publishedTime?: string | undefined;
  favicon?: string | undefined;
  canonicalUrl?: string | undefined;
}

export interface WebArticleResult {
  metadata: WebArticleMetadata;
  markdown: string;
  textContent: string;
}

function normalizeDateToIsoUtc(rawDate: string | undefined): string | undefined {
  if (!rawDate) return undefined;
  const parsed = new Date(rawDate);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

interface JsonLdMetadata {
  headline?: string | undefined;
  author?: string | undefined;
  datePublished?: string | undefined;
  description?: string | undefined;
  publisher?: string | undefined;
}

function extractJsonLd(document: Document): JsonLdMetadata {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const content = script.textContent;
      if (!content || !content.trim()) continue;
      const parsed: unknown = JSON.parse(content);
      const candidates: unknown[] = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "@graph" in parsed && Array.isArray((parsed as { "@graph": unknown[] })["@graph"])
          ? (parsed as { "@graph": unknown[] })["@graph"]
          : [parsed];

      for (const item of candidates) {
        if (typeof item === "object" && item !== null) {
          const rec = item as Record<string, unknown>;
          const type = String(rec["@type"] ?? "");
          if (
            type === "Article" ||
            type === "NewsArticle" ||
            type === "BlogPosting" ||
            type === "WebPage" ||
            rec["headline"] !== undefined ||
            rec["datePublished"] !== undefined
          ) {
            let authorName: string | undefined;
            if (typeof rec["author"] === "string") {
              authorName = rec["author"];
            } else if (
              Array.isArray(rec["author"]) &&
              rec["author"].length > 0 &&
              typeof rec["author"][0] === "object" &&
              rec["author"][0] !== null
            ) {
              const firstAuthor = rec["author"][0] as Record<string, unknown>;
              if (typeof firstAuthor["name"] === "string") {
                authorName = firstAuthor["name"];
              }
            } else if (typeof rec["author"] === "object" && rec["author"] !== null) {
              const authorObj = rec["author"] as Record<string, unknown>;
              if (typeof authorObj["name"] === "string") {
                authorName = authorObj["name"];
              }
            }

            let publisherName: string | undefined;
            if (typeof rec["publisher"] === "string") {
              publisherName = rec["publisher"];
            } else if (typeof rec["publisher"] === "object" && rec["publisher"] !== null) {
              const pubObj = rec["publisher"] as Record<string, unknown>;
              if (typeof pubObj["name"] === "string") {
                publisherName = pubObj["name"];
              }
            }

            return {
              headline:
                typeof rec["headline"] === "string"
                  ? rec["headline"]
                  : typeof rec["name"] === "string"
                    ? rec["name"]
                    : undefined,
              author: authorName,
              datePublished: typeof rec["datePublished"] === "string" ? rec["datePublished"] : undefined,
              description: typeof rec["description"] === "string" ? rec["description"] : undefined,
              publisher: publisherName,
            };
          }
        }
      }
    } catch {
      // Ignore invalid JSON-LD script syntax
    }
  }
  return {};
}

export class WebReaderService {
  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    // Apply Joplin GFM plugin for robust table support
    this.turndown.use(gfm);

    // Strip scripts and styles
    this.turndown.remove(["script", "style", "noscript", "iframe"]);
  }

  public extract(rawHtml: string, targetUrl: string): WebArticleResult {
    if (!rawHtml || !rawHtml.trim()) {
      return {
        metadata: {
          title: "",
          author: "",
          description: "",
          url: targetUrl,
        },
        markdown: "",
        textContent: "",
      };
    }

    // Step 1: Parse HTML and safely inject base href via DOM API
    const { document } = parseHTML(rawHtml);
    try {
      const base = document.createElement("base");
      base.setAttribute("href", targetUrl);
      if (document.head) {
        document.head.prepend(base);
      }
    } catch {
      // Ignore base injection failure
    }

    // Step 2: Extract JSON-LD and meta tags BEFORE Readability mutates the DOM
    const jsonLd = extractJsonLd(document as Document);

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim();
    const docTitle = document.querySelector("title")?.textContent?.trim();

    const authorMeta =
      document.querySelector('meta[property="article:author"]')?.getAttribute("content")?.trim() ??
      document.querySelector('meta[name="author"]')?.getAttribute("content")?.trim();

    const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim();
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();

    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();

    const publishedMeta =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content")?.trim() ??
      document.querySelector('meta[name="dc.date"]')?.getAttribute("content")?.trim() ??
      document.querySelector("time[datetime]")?.getAttribute("datetime")?.trim();

    const faviconHref =
      document.querySelector('link[rel="icon"]')?.getAttribute("href") ??
      document.querySelector('link[rel="shortcut icon"]')?.getAttribute("href");
    let favicon: string | undefined;
    if (faviconHref) {
      try {
        favicon = new URL(faviconHref, targetUrl).toString();
      } catch {
        favicon = undefined;
      }
    }

    const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    let canonicalUrl: string | undefined;
    if (canonicalHref) {
      try {
        canonicalUrl = new URL(canonicalHref, targetUrl).toString();
      } catch {
        canonicalUrl = undefined;
      }
    }

    // Step 3: Run Readability body extraction
    const reader = new Readability(document as Document);
    const parsedArticle = reader.parse();

    let contentHtml = "";
    let textContent = "";

    if (parsedArticle) {
      contentHtml = parsedArticle.content ?? "";
      textContent = parsedArticle.textContent ?? "";
    } else {
      // Fallback: use body element if readability couldn't isolate an article container
      const body = document.querySelector("body");
      contentHtml = body ? body.innerHTML : rawHtml;
      textContent = body ? body.textContent ?? "" : "";
    }

    // Cascade Priority (per Research 05 Section 4):
    // 1. Title: og:title -> jsonld:headline -> twitter:title -> Readability.title -> <title>
    const title =
      ogTitle ||
      jsonLd.headline ||
      twitterTitle ||
      (parsedArticle?.title ? parsedArticle.title.trim() : "") ||
      docTitle ||
      "";

    // 2. Author: jsonld:author -> article:author / meta[name=author] -> Readability.byline
    const author =
      jsonLd.author ||
      authorMeta ||
      (parsedArticle?.byline ? parsedArticle.byline.trim() : "") ||
      "";

    // 3. Published Date: jsonld:datePublished -> article:published_time -> dc.date -> time[datetime] (normalized to ISO-8601 UTC)
    const publishedTime = normalizeDateToIsoUtc(jsonLd.datePublished || publishedMeta);

    // 4. Description: og:description -> jsonld:description -> meta[name=description] -> Readability.excerpt
    const description =
      ogDesc ||
      jsonLd.description ||
      metaDesc ||
      (parsedArticle?.excerpt ? parsedArticle.excerpt.trim() : "") ||
      "";

    // 5. Site Name: og:site_name -> jsonld:publisher -> hostname fallback
    let defaultHostname: string | undefined;
    try {
      defaultHostname = new URL(targetUrl).hostname;
    } catch {
      defaultHostname = undefined;
    }
    const siteName = ogSite || jsonLd.publisher || defaultHostname || undefined;

    // Step 4: Sanitize HTML to prevent stored XSS smuggling before Turndown markdown conversion
    const sanitizedHtml = sanitizeHtml(contentHtml, {
      allowedTags: [
        ...sanitizeHtml.defaults.allowedTags,
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "th",
        "td",
        "img",
        "pre",
        "code",
      ],
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt", "title"],
        a: ["href", "title", "target"],
        th: ["colspan", "rowspan", "align"],
        td: ["colspan", "rowspan", "align"],
        code: ["class"],
      },
      allowedSchemes: ["http", "https", "mailto"],
    });

    // Step 5: Convert sanitized HTML to clean GFM Markdown
    let markdown = this.turndown.turndown(sanitizedHtml).trim();
    if (title && !markdown.startsWith("# ")) {
      markdown = `# ${title}\n\n${markdown}`;
    }

    const metadata: WebArticleMetadata = {
      title,
      author,
      description,
      url: targetUrl,
    };
    if (siteName) {
      metadata.siteName = siteName;
    }
    if (publishedTime) {
      metadata.publishedTime = publishedTime;
    }
    if (parsedArticle?.byline) {
      metadata.byline = parsedArticle.byline;
    }
    if (favicon) {
      metadata.favicon = favicon;
    }
    if (canonicalUrl) {
      metadata.canonicalUrl = canonicalUrl;
    }

    return {
      metadata,
      markdown,
      textContent: textContent.trim(),
    };
  }
}
