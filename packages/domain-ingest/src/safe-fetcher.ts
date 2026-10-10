import dnsPromises from "node:dns/promises";
import dns from "node:dns";
import net from "node:net";
import {
  SsrfBlockedError,
  PayloadTooLargeError,
  InvalidContentTypeError,
} from "@notebook/contracts";

export { SsrfBlockedError, PayloadTooLargeError, InvalidContentTypeError };

/**
 * Checks if an IPv4 address is in private, loopback, link-local, or cloud metadata ranges.
 * Implements RFC 6890, RFC 1918, RFC 1122, RFC 3927, RFC 6598, RFC 5737.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is unsafe
  }

  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = parts;
  const num = ((p0 << 24) | (p1 << 16) | (p2 << 8) | p3) >>> 0;

  // 0.0.0.0/8 (Current network / localhost bypass)
  if (((num & 0xff000000) >>> 0) === 0x00000000) return true;
  // 10.0.0.0/8 (RFC 1918)
  if (((num & 0xff000000) >>> 0) === 0x0a000000) return true;
  // 100.64.0.0/10 (RFC 6598 CGNAT / Shared Address Space)
  if (((num & 0xffc00000) >>> 0) === 0x64400000) return true;
  // 127.0.0.0/8 (RFC 1122 Loopback)
  if (((num & 0xff000000) >>> 0) === 0x7f000000) return true;
  // 169.254.0.0/16 (RFC 3927 Link-local / Cloud Metadata AWS, GCP, etc.)
  if (((num & 0xffff0000) >>> 0) === 0xa9fe0000) return true;
  // 172.16.0.0/12 (RFC 1918)
  if (((num & 0xfff00000) >>> 0) === 0xac100000) return true;
  // 192.0.0.0/24 (RFC 6890 IETF Protocol Assignments)
  if (((num & 0xffffff00) >>> 0) === 0xc0000000) return true;
  // 192.0.2.0/24 (RFC 5737 TEST-NET-1)
  if (((num & 0xffffff00) >>> 0) === 0xc0000200) return true;
  // 192.88.99.0/24 (RFC 7526 6to4 Relay)
  if (((num & 0xffffff00) >>> 0) === 0xc0586300) return true;
  // 192.168.0.0/16 (RFC 1918)
  if (((num & 0xffff0000) >>> 0) === 0xc0a80000) return true;
  // 198.18.0.0/15 (RFC 2544 Benchmarking)
  if (((num & 0xfffe0000) >>> 0) === 0xc6120000) return true;
  // 198.51.100.0/24 (RFC 5737 TEST-NET-2)
  if (((num & 0xffffff00) >>> 0) === 0xc6336400) return true;
  // 203.0.113.0/24 (RFC 5737 TEST-NET-3)
  if (((num & 0xffffff00) >>> 0) === 0xcb007100) return true;
  // 224.0.0.0/4 (RFC 1112 Multicast)
  if (((num & 0xf0000000) >>> 0) === 0xe0000000) return true;
  // 240.0.0.0/4 (Reserved)
  if (((num & 0xf0000000) >>> 0) === 0xf0000000) return true;
  // 255.255.255.255/32 (Limited broadcast)
  if (num === 0xffffffff) return true;
  // Azure WireServer 168.63.129.16
  if (num === 0xa83f8110) return true;
  // Alibaba Cloud metadata 100.100.100.200
  if (num === 0x646464c8) return true;

  return false;
}

/**
 * Parses IPv6 address into eight 16-bit words.
 * Returns null if the address is malformed.
 */
function parseIpv6Words(ip: string): number[] | null {
  const clean = ip.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (!clean) return null;

  // Handle IPv4-mapped IPv6 embedded notation e.g. ::ffff:127.0.0.1
  if (clean.includes(".")) {
    const lastColon = clean.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v6Prefix = clean.slice(0, lastColon);
    const v4Part = clean.slice(lastColon + 1);
    const v4Parts = v4Part.split(".").map(Number);
    if (v4Parts.length !== 4 || v4Parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return null;
    }
    const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = v4Parts;
    const word6 = ((p0 << 8) | p1) >>> 0;
    const word7 = ((p2 << 8) | p3) >>> 0;
    const hexV4 = `${word6.toString(16)}:${word7.toString(16)}`;
    const expanded = v6Prefix ? `${v6Prefix}:${hexV4}` : hexV4;
    return parseIpv6Words(expanded);
  }

  const parts = clean.split("::");
  if (parts.length > 2) return null;

  let leftWords: number[] = [];
  let rightWords: number[] = [];

  if (parts[0]) {
    leftWords = parts[0].split(":").map((h) => parseInt(h, 16));
    if (leftWords.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
  }

  if (parts.length === 2 && parts[1]) {
    rightWords = parts[1].split(":").map((h) => parseInt(h, 16));
    if (rightWords.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
  }

  const totalDefined = leftWords.length + rightWords.length;
  if (parts.length === 1 && totalDefined !== 8) return null;
  if (totalDefined > 8) return null;

  const zerosCount = 8 - totalDefined;
  const zeroWords = new Array(zerosCount).fill(0);

  return [...leftWords, ...zeroWords, ...rightWords];
}

/**
 * Checks if an IPv6 address is in loopback, link-local, ULA, or multicast ranges.
 * Implements RFC 4291, RFC 4193, RFC 6052, RFC 3056, RFC 3849, RFC 6666.
 */
function isPrivateIpv6(ip: string): boolean {
  const words = parseIpv6Words(ip);
  if (!words) {
    return true; // Malformed IPv6 is treated as unsafe
  }

  const [w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0, w6 = 0, w7 = 0] = words;

  // Unspecified ::/128
  if (words.every((w) => w === 0)) return true;

  // Loopback ::1/128 (matches ::1, ::0001, 0000:...:0001, etc.)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) {
    return true;
  }

  // IPv4-mapped IPv6 ::ffff:0:0/96
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) {
    const p0 = (w6 >> 8) & 0xff;
    const p1 = w6 & 0xff;
    const p2 = (w7 >> 8) & 0xff;
    const p3 = w7 & 0xff;
    return isPrivateIpv4(`${p0}.${p1}.${p2}.${p3}`);
  }

  // Link-local: fe80::/10 (fe80 to febf)
  if ((w0 & 0xffc0) === 0xfe80) return true;

  // Unique Local Address (ULA): fc00::/7 (fc00:: and fd00::)
  if ((w0 & 0xfe00) === 0xfc00) return true;

  // Multicast: ff00::/8
  if ((w0 & 0xff00) === 0xff00) return true;

  // Documentation prefix: 2001:db8::/32
  if (w0 === 0x2001 && w1 === 0x0db8) return true;

  // Discard prefix: 100::/64
  if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) return true;

  // 6to4 encapsulation: 2002::/16
  if (w0 === 0x2002) {
    const p0 = (w1 >> 8) & 0xff;
    const p1 = w1 & 0xff;
    const p2 = (w2 >> 8) & 0xff;
    const p3 = w2 & 0xff;
    return isPrivateIpv4(`${p0}.${p1}.${p2}.${p3}`);
  }

  // NAT64 well-known prefix: 64:ff9b::/96
  if (w0 === 0x0064 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
    return true;
  }

  return false;
}

/**
 * Public predicate verifying whether an IP address is private, link-local, or cloud metadata.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIpv4(ip);
  }
  if (net.isIPv6(ip) || ip.includes(":")) {
    return isPrivateIpv6(ip);
  }
  return true; // Unknown/unrecognized format is treated as unsafe
}

export interface DnsLookupResult {
  address: string;
  family: number;
}

export type DnsLookupFn = (hostname: string) => Promise<DnsLookupResult[]>;

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body?: string | undefined;
}

export type HttpDispatchFn = (url: string, options: { signal: AbortSignal }) => Promise<HttpResponse>;

export interface SafeUrlFetcherOptions {
  dnsLookup?: DnsLookupFn | undefined;
  httpDispatch?: HttpDispatchFn | undefined;
  maxRedirects?: number | undefined;
  maxSizeBytes?: number | undefined;
  timeoutMs?: number | undefined;
}

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 15000;

export class SafeUrlFetcher {
  private readonly dnsLookup: DnsLookupFn;
  private readonly httpDispatch: HttpDispatchFn;
  private readonly maxRedirects: number;
  private readonly maxSizeBytes: number;
  private readonly timeoutMs: number;

  constructor(options: SafeUrlFetcherOptions = {}) {
    this.dnsLookup =
      options.dnsLookup ??
      (async (hostname: string) => {
        const results = await dnsPromises.lookup(hostname, { all: true });
        return results;
      });

    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const maxBytes = this.maxSizeBytes;

    this.httpDispatch =
      options.httpDispatch ??
      (async (url: string, { signal }) => {
        const { Agent, request } = await import("undici");

        // Custom connect.lookup hook pins socket to the verified IP (preventing CVE-2023-40028 DNS rebinding)
        const agent = new Agent({
          connect: {
            lookup: (
              hostname: string,
              opts: dns.LookupOptions,
              callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
            ) => {
              dns.lookup(hostname, { all: true }, (err, addresses) => {
                if (err) return callback(err, "");
                if (!addresses || addresses.length === 0) {
                  return callback(new SsrfBlockedError(`DNS resolution returned zero records for ${hostname}`), "");
                }
                for (const record of addresses) {
                  if (isPrivateIp(record.address)) {
                    return callback(
                      new SsrfBlockedError(`SSRF Blocked: Host ${hostname} resolved to private IP ${record.address}`),
                      ""
                    );
                  }
                }
                const isAll = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
                if (isAll) {
                  callback(null, addresses);
                } else {
                  const first = addresses[0];
                  callback(null, first?.address ?? "", first?.family ?? 4);
                }
              });
            },
            timeout: 5000,
          },
          pipelining: 0,
        });

        const res = await request(url, {
          signal,
          dispatcher: agent,
        });

        // Stage 1: Pre-flight content-length check
        const contentLength = res.headers["content-length"];
        if (contentLength) {
          const parsedLen = parseInt(Array.isArray(contentLength) ? contentLength[0] ?? "0" : contentLength, 10);
          if (parsedLen > maxBytes) {
            await res.body.destroy();
            throw new PayloadTooLargeError(`Payload size ${parsedLen} bytes exceeds ${maxBytes} bytes limit.`);
          }
        }

        // Stage 2: Streaming chunk counter preventing memory exhaustion Heap DoS
        const chunks: Buffer[] = [];
        let accumulatedBytes = 0;
        for await (const chunk of res.body) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
          accumulatedBytes += buf.length;
          if (accumulatedBytes > maxBytes) {
            await res.body.destroy();
            throw new PayloadTooLargeError(`Payload size exceeded limit of ${maxBytes} bytes.`);
          }
          chunks.push(buf);
        }

        return {
          status: res.statusCode,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString("utf-8"),
        };
      });
  }

  public async fetch(initialUrl: string): Promise<HttpResponse> {
    let currentUrl = initialUrl;
    let redirectCount = 0;
    const visitedUrls = new Set<string>();

    const ALLOWED_CONTENT_TYPES = [
      "text/html",
      "text/plain",
      "text/markdown",
      "application/xhtml+xml",
      "application/json",
      "text/xml",
      "application/xml",
    ];

    while (redirectCount <= this.maxRedirects) {
      if (visitedUrls.has(currentUrl)) {
        throw new SsrfBlockedError(`Redirect loop detected: ${currentUrl}`);
      }
      visitedUrls.add(currentUrl);

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(currentUrl);
      } catch {
        throw new SsrfBlockedError(`Invalid URL: ${currentUrl}`);
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new SsrfBlockedError(`Forbidden protocol: ${parsedUrl.protocol}. Only http: and https: are allowed.`);
      }

      // Block credentials embedded in URL user:pass@host
      if (parsedUrl.username || parsedUrl.password) {
        throw new SsrfBlockedError("URLs with embedded credentials (user:pass@host) are strictly forbidden.");
      }

      const rawHost = parsedUrl.hostname.toLowerCase();
      const hostname = rawHost.replace(/^\[|\]$/g, "");

      // Block cloud metadata hostnames directly
      if (hostname === "metadata.google.internal" || hostname.endsWith(".metadata.google.internal")) {
        throw new SsrfBlockedError(`Access to cloud metadata hostname ${hostname} is blocked.`);
      }

      // Check if hostname is already a raw IP literal (handling bracketed IPv6)
      if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) {
          throw new SsrfBlockedError(`Access to private IP ${hostname} is blocked.`);
        }
      } else {
        // Resolve DNS and check ALL returned addresses to prevent round-robin / rebinding attacks
        let addresses: DnsLookupResult[];
        try {
          addresses = await this.dnsLookup(hostname);
        } catch (err) {
          throw new SsrfBlockedError(`DNS resolution failed for ${hostname}: ${String(err)}`);
        }

        if (addresses.length === 0) {
          throw new SsrfBlockedError(`DNS resolution returned zero records for ${hostname}`);
        }

        for (const record of addresses) {
          if (isPrivateIp(record.address)) {
            throw new SsrfBlockedError(
              `Host ${hostname} resolved to private/forbidden IP ${record.address}. Request blocked.`
            );
          }
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.httpDispatch(currentUrl, { signal: controller.signal });

        // Handle redirects manually
        const locationHeaderRaw = response.headers["location"];
        if (
          [301, 302, 303, 307, 308].includes(response.status) &&
          locationHeaderRaw
        ) {
          redirectCount++;
          if (redirectCount > this.maxRedirects) {
            throw new SsrfBlockedError(`Too many redirects: exceeded ${this.maxRedirects} hops limit.`);
          }
          const locationHeader = Array.isArray(locationHeaderRaw)
            ? locationHeaderRaw[0]
            : locationHeaderRaw;
          currentUrl = new URL(locationHeader ?? "", currentUrl).toString();
          continue;
        }

        // Tier 4: Content-Type inspection
        const contentTypeHeader = response.headers["content-type"];
        if (contentTypeHeader) {
          const rawCt = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] ?? "" : contentTypeHeader;
          const mediaType = rawCt.split(";")[0]?.trim().toLowerCase() ?? "";
          if (mediaType && !ALLOWED_CONTENT_TYPES.includes(mediaType)) {
            throw new InvalidContentTypeError(
              `Forbidden Content-Type: '${mediaType}'. Only text, HTML, and markdown documents are allowed.`
            );
          }
        }

        // Check response size on received headers as well
        const contentLength = response.headers["content-length"];
        if (contentLength) {
          const size = parseInt(Array.isArray(contentLength) ? contentLength[0] ?? "0" : contentLength, 10);
          if (size > this.maxSizeBytes) {
            throw new PayloadTooLargeError(`Payload size ${size} bytes exceeds ${this.maxSizeBytes} bytes limit.`);
          }
        }

        return response;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new SsrfBlockedError(`Too many redirects: exceeded ${this.maxRedirects} hops limit.`);
  }
}
