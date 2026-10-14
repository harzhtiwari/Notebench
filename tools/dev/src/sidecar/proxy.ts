import { request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import type { Duplex } from "node:stream";
import { OrchestratorError } from "../types.js";

/**
 * Proxy-before-Next for the dev web sidecar (ticket 04, spec 5.8–5.9).
 *
 * `request`: the three API prefixes go to the live server first;
 * everything else (pages, assets) goes to the page handler.
 * `upgrade`: API prefixes never receive upgrades (rejected); everything
 * else reaches the compiler's own upgrade handler (dev HMR transport).
 */

interface PageHandler {
  (req: IncomingMessage, res: ServerResponse): Promise<void> | void;
}

interface UpgradeHandler {
  (req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> | void;
}

export interface SidecarProxyOptions {
  serverOrigin: string;
  pageHandler: PageHandler;
  upgradeHandler?: UpgradeHandler | undefined;
}

export interface SidecarProxy {
  handleRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

/** Proxied prefixes (spec 7.4): `/api`, `/artifacts`, `/frames`. */
const PROXIED_PREFIXES: readonly string[] = ["/api", "/artifacts", "/frames"];

/**
 * Boundary-aware prefix match: `/api` matches `/api` and `/api/x` but
 * never `/apix` (spec 5.9).
 */
function isProxiedPath(pathname: string): boolean {
  for (const prefix of PROXIED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function pathnameOf(rawUrl: string): string {
  const queryIndex = rawUrl.indexOf("?");
  return queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
}

/**
 * Typed outage response: the server is down, so API paths get an explicit
 * JSON 502 — never page HTML (spec 7.5).
 */
function sendUpstreamUnavailable(res: ServerResponse, detail: string): void {
  const body = JSON.stringify({
    error: {
      code: "UPSTREAM_UNAVAILABLE",
      message: `Server unavailable: ${detail}`,
      service: "server",
    },
  });
  res.writeHead(502, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Hostnames the sidecar may proxy toward: loopback only (spec 5.9). */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

function parseLoopbackOrigin(serverOrigin: string): URL {
  let origin: URL;
  try {
    origin = new URL(serverOrigin);
  } catch {
    throw new OrchestratorError(`Invalid server origin "${serverOrigin}": must be a URL.`, 1);
  }
  if (origin.protocol !== "http:") {
    throw new OrchestratorError(
      `Invalid server origin "${serverOrigin}": only http loopback origins are proxied.`,
      1
    );
  }
  const hostname = origin.hostname.toLowerCase();
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (!LOOPBACK_HOSTS.has(bare)) {
    throw new OrchestratorError(
      `Refusing non-loopback server origin "${serverOrigin}": the sidecar proxies to the local server only.`,
      1
    );
  }
  return origin;
}
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function forwardedHeaders(req: IncomingMessage): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers[name] = value;
  }
  return headers;
}

export function createSidecarProxy(options: SidecarProxyOptions): SidecarProxy {
  const origin = parseLoopbackOrigin(options.serverOrigin);
  const pageHandler = options.pageHandler;
  const upgradeHandler = options.upgradeHandler;

  return {
    handleRequest: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const rawUrl = req.url ?? "/";
      if (!isProxiedPath(pathnameOf(rawUrl))) {
        return Promise.resolve(pageHandler(req, res)).then(() => undefined);
      }
      return new Promise<void>((resolve) => {
        const proxyReq = httpRequest(
          {
            protocol: origin.protocol,
            hostname: origin.hostname,
            port: origin.port,
            method: req.method,
            path: rawUrl,
            headers: forwardedHeaders(req),
          },
          (proxyRes) => {
            proxyRes.on("error", () => {
              // Mid-stream upstream failure: headers already went out, so
              // the stream can only end, never become a typed outage.
              try {
                if (!res.headersSent) sendUpstreamUnavailable(res, "upstream failed");
                else res.destroy();
              } catch {
                res.destroy();
              }
              resolve();
            });
            try {
              res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            } catch {
              res.destroy();
              resolve();
              return;
            }
            proxyRes.pipe(res);
            proxyRes.on("end", () => resolve());
          }
        );
        proxyReq.on("error", () => {
          try {
            if (!res.headersSent) sendUpstreamUnavailable(res, "connection refused");
            else res.destroy();
          } catch {
            res.destroy();
          }
          resolve();
        });
        // Client abort: the request never completed, or the client went
        // away mid-response — stop the upstream request. A normally
        // completed request/response pair must not destroy anything:
        // `close` also fires at the end of a healthy stream.
        req.on("close", () => {
          if (!req.complete) proxyReq.destroy();
        });
        res.on("close", () => {
          if (!res.writableEnded) proxyReq.destroy();
        });
        req.pipe(proxyReq);
      });
    },

    handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
      const rawUrl = req.url ?? "/";
      if (isProxiedPath(pathnameOf(rawUrl))) {
        socket.destroy();
        return;
      }
      if (upgradeHandler !== undefined) {
        void upgradeHandler(req, socket, head);
        return;
      }
      socket.destroy();
    },
  };
}
