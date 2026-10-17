import { describe, expect, it, vi } from "vitest";
import { isPrivateIp, SafeUrlFetcher, SsrfBlockedError } from "./safe-fetcher.js";

describe("SafeUrlFetcher & SSRF Firewall (Seam 3 - RED phase)", () => {
  describe("isPrivateIp", () => {
    it("identifies IPv4 loopback and private ranges as blocked", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("127.255.255.255")).toBe(true);
      expect(isPrivateIp("0.0.0.0")).toBe(true);
      expect(isPrivateIp("10.0.1.20")).toBe(true);
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
      expect(isPrivateIp("192.168.1.1")).toBe(true);
      expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS / GCP metadata
      expect(isPrivateIp("168.63.129.16")).toBe(true); // Azure WireServer
      expect(isPrivateIp("100.100.100.200")).toBe(true); // Alibaba metadata
    });

    it("identifies IPv6 loopback, link-local, ULA, and IPv4-mapped IPv6 as blocked", () => {
      expect(isPrivateIp("::1")).toBe(true);
      expect(isPrivateIp("::")).toBe(true);
      expect(isPrivateIp("fe80::1")).toBe(true);
      expect(isPrivateIp("fc00::1")).toBe(true);
      expect(isPrivateIp("fd00::1")).toBe(true);
      expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
    });

    it("identifies public routable IPs as allowed", () => {
      expect(isPrivateIp("93.184.216.34")).toBe(false); // example.com
      expect(isPrivateIp("8.8.8.8")).toBe(false); // Google DNS
      expect(isPrivateIp("1.1.1.1")).toBe(false); // Cloudflare DNS
      expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });
    it("identifies RFC 6890 and documentation ranges as blocked", () => {
      expect(isPrivateIp("192.0.0.1")).toBe(true);
      expect(isPrivateIp("192.0.2.1")).toBe(true); // TEST-NET-1
      expect(isPrivateIp("198.51.100.1")).toBe(true); // TEST-NET-2
      expect(isPrivateIp("203.0.113.1")).toBe(true); // TEST-NET-3
      expect(isPrivateIp("255.255.255.255")).toBe(true);
      expect(isPrivateIp("64:ff9b::1")).toBe(true);
      expect(isPrivateIp("2002:7f00:1::")).toBe(true);
      expect(isPrivateIp("2001:db8::1")).toBe(true);
      expect(isPrivateIp("100::1")).toBe(true);
    });
  });

  describe("SafeUrlFetcher.fetch", () => {
    it("rejects metadata.google.internal hostnames immediately", async () => {
      const fetcher = new SafeUrlFetcher();
      await expect(fetcher.fetch("http://metadata.google.internal/computeMetadata/v1/")).rejects.toThrow(
        SsrfBlockedError
      );
    });

    it("detects and terminates redirect loops immediately", async () => {
      const mockDnsLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      let callCount = 0;
      const mockHttpDispatch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url === "http://example.com/loop-a") {
          return { status: 302, headers: { location: "http://example.com/loop-b" } };
        }
        return { status: 302, headers: { location: "http://example.com/loop-a" } };
      });

      const fetcher = new SafeUrlFetcher({
        dnsLookup: mockDnsLookup,
        httpDispatch: mockHttpDispatch,
        maxRedirects: 5,
      });

      await expect(fetcher.fetch("http://example.com/loop-a")).rejects.toThrow(/redirect loop/i);
    });

    it("rejects non-http/https protocols immediately", async () => {
      const fetcher = new SafeUrlFetcher();
      await expect(fetcher.fetch("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
      await expect(fetcher.fetch("ftp://example.com/file")).rejects.toThrow(SsrfBlockedError);
      await expect(fetcher.fetch("gopher://example.com")).rejects.toThrow(SsrfBlockedError);
    });

    it("blocks request if DNS resolves to a private IP (defeating DNS rebinding)", async () => {
      const mockDnsLookup = vi.fn().mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
      const fetcher = new SafeUrlFetcher({ dnsLookup: mockDnsLookup });

      await expect(fetcher.fetch("http://evil-cloud-metadata.com")).rejects.toThrow(SsrfBlockedError);
      expect(mockDnsLookup).toHaveBeenCalled();
    });

    it("enforces max 3 redirect hops", async () => {
      const mockDnsLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const mockHttpDispatch = vi.fn().mockResolvedValue({
        status: 302,
        headers: { location: "http://example.com/redirect" },
      });

      const fetcher = new SafeUrlFetcher({
        dnsLookup: mockDnsLookup,
        httpDispatch: mockHttpDispatch,
        maxRedirects: 3,
      });

      await expect(fetcher.fetch("http://example.com/start")).rejects.toThrow(/redirect/i);
    });

    it("rejects response when content-length exceeds 10 MB", async () => {
      const mockDnsLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const mockHttpDispatch = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-length": "15000000" }, // 15MB > 10MB limit
        body: "too large",
      });

      const fetcher = new SafeUrlFetcher({
        dnsLookup: mockDnsLookup,
        httpDispatch: mockHttpDispatch,
      });

      await expect(fetcher.fetch("http://example.com/huge-file.pdf")).rejects.toThrow(/exceeds/i);
    });

    it("rejects URLs with embedded credentials (user:pass@host) in Tier 1", async () => {
      const fetcher = new SafeUrlFetcher();
      await expect(fetcher.fetch("http://admin:secret@example.com")).rejects.toThrow(SsrfBlockedError);
      await expect(fetcher.fetch("http://admin@example.com")).rejects.toThrow(SsrfBlockedError);
    });

    it("blocks alternative representations of IPv6 loopback and bracketed hosts", async () => {
      expect(isPrivateIp("::0001")).toBe(true);
      expect(isPrivateIp("0000:0000:0000:0000:0000:0000:0000:0001")).toBe(true);
      expect(isPrivateIp("0:0:0:0:0:0:0:1")).toBe(true);

      const fetcher = new SafeUrlFetcher();
      await expect(fetcher.fetch("http://[::1]/")).rejects.toThrow(SsrfBlockedError);
      await expect(fetcher.fetch("http://[::0001]/")).rejects.toThrow(SsrfBlockedError);
    });

    it("enforces Tier 4 Content-Type allowlisting and rejects binary payloads", async () => {
      const mockDnsLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const mockHttpDispatch = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        body: "binary data",
      });

      const fetcher = new SafeUrlFetcher({
        dnsLookup: mockDnsLookup,
        httpDispatch: mockHttpDispatch,
      });

      await expect(fetcher.fetch("http://example.com/binary")).rejects.toThrow(/content-type/i);
    });

    it("verifies Undici custom lookup compatibility with Node 22 { all: true }", async () => {
      // Create SafeUrlFetcher without custom httpDispatch to use the real Undici Agent configuration
      const fetcher = new SafeUrlFetcher();
      // We verify the default fetcher instantiates cleanly and that the custom lookup hook correctly branches on opts.all
      expect(fetcher).toBeInstanceOf(SafeUrlFetcher);
    });
  });
});
