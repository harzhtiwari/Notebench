import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSidecarProxy } from "../src/sidecar/proxy.js";

/**
 * Ticket 04 RED suite (written before implementation).
 *
 * Seams under test (public boundaries only):
 * - proxy: createSidecarProxy observed via real HTTP against fixture origin
 *   servers and an injected page handler (routing, streaming, headers,
 *   outage shape, upgrade split).
 * - adapter: real Next compiler boot observed via real HTTP + real files
 *   (namespaced output, export-dir-moved proof, clean shutdown).
 * - composer: web-phase supervision observed via real processes running
 *   fixture sidecar entries (order, records, reverse teardown, crashes).
 * - contract pins: spec literals (env names, 502 shape, exit codes).
 *
 * Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
 */

const servers: Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop() as Server;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "notebench-sidecar-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop() as string;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if ((code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY") && attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        throw error;
      }
    }
  }
});

function listen(server: Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("proxy test server did not bind a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function startOrigin(): Promise<{ port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ proxied: true, url: req.url, method: req.method }));
  });
  return listen(server).then((port) => ({ port }));
}

function pageHandler(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<html><body>page</body></html>");
}

async function startProxy(originPort: number): Promise<{ port: number }> {
  const proxy = createSidecarProxy({
    serverOrigin: `http://127.0.0.1:${originPort}`,
    pageHandler,
  });
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void proxy.handleRequest(req, res);
  });
  const port = await listen(server);
  return { port };
}

describe("ticket 04: proxy routes API prefixes to the server first", () => {
  it("proxies boundary-aware prefixes and leaves near-miss paths to the page handler", async () => {
    const origin = await startOrigin();
    const proxy = await startProxy(origin.port);
    const get = async (path: string): Promise<{ status: number; body: string }> => {
      const res = await fetch(`http://127.0.0.1:${proxy.port}${path}`);
      return { status: res.status, body: await res.text() };
    };

    // Exact prefixes and sub-paths reach the live backend (spec 5.9, 7.4).
    for (const path of ["/api", "/api/healthz", "/artifacts", "/artifacts/a", "/frames", "/frames/f/1"]) {
      const { status, body } = await get(path);
      expect(status).toBe(200);
      expect(JSON.parse(body)).toMatchObject({ proxied: true, url: path });
    }

    // Near-miss paths never proxy (spec 5.9).
    for (const path of ["/apix", "/api-v2", "/artifact", "/frames2", "/"]) {
      const { status, body } = await get(path);
      expect(status).toBe(200);
      expect(body).toContain("<html>");
    }
  }, 15_000);

  it("forwards method, path, query, and streaming bodies to the backend intact", async () => {
    const received: Array<{ method: string; url: string; body: string }> = [];
    const origin = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (chunk: unknown) => {
        body += String(chunk);
      });
      req.on("end", () => {
        received.push({ method: req.method ?? "", url: req.url ?? "", body });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    const originPort = await listen(origin);
    const proxy = await startProxy(originPort);

    // Chunked streaming upload with query string, no content-length set.
    const payload = "x".repeat(64 * 1024);
    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/upload?mode=stream`, {
      method: "POST",
      headers: { "content-type": "text/plain", "x-custom": "kept" },
      body: payload,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(200);

    expect(received).toHaveLength(1);
    const hit = received[0] as { method: string; url: string; body: string };
    expect(hit.method).toBe("POST");
    expect(hit.url).toBe("/api/upload?mode=stream");
    expect(hit.body).toBe(payload);
  }, 15_000);

  it("streams SSE chunks incrementally without buffering (spec 5.9)", async () => {
    const origin = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: one\n\n");
      setTimeout(() => res.write("data: two\n\n"), 300);
      setTimeout(() => res.end("data: three\n\n"), 600);
    });
    const originPort = await listen(origin);
    const proxy = await startProxy(originPort);

    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const arrivals: number[] = [];
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arrivals.push(Date.now());
      text += new TextDecoder().decode(value);
    }
    expect(text).toContain("data: one");
    expect(text).toContain("data: three");
    // First chunk arrives well before the stream ends: no buffering.
    const first = arrivals[0] as number;
    const last = arrivals[arrivals.length - 1] as number;
    expect(last - first).toBeGreaterThanOrEqual(400);
  }, 15_000);

  it("strips hop-by-hop headers while keeping end-to-end headers (spec 5.9)", async () => {
    let seen: Record<string, string | string[] | undefined> | null = null;
    const origin = createServer((req: IncomingMessage, res: ServerResponse) => {
      seen = { ...req.headers };
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    const originPort = await listen(origin);
    const proxy = await startProxy(originPort);

    const { request: httpRequest } = await import("node:http");
    await new Promise<void>((resolve, reject) => {
      const clientReq = httpRequest(
        {
          host: "127.0.0.1",
          port: proxy.port,
          path: "/api/headers",
          method: "GET",
          headers: {
            connection: "close",
            "keep-alive": "timeout=5",
            "proxy-authorization": "secret",
            "proxy-authenticate": "challenge",
            te: "trailers",
            upgrade: "websocket",
            "x-custom": "kept",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve());
        }
      );
      clientReq.on("error", reject);
      clientReq.end();
    });

    const captured = seen as unknown as Record<string, string | string[] | undefined>;
    expect(captured).not.toBeNull();
    // The explicit `connection: close` must not reach the server: the proxy
    // strips it and the framing header seen here is the HTTP client's own
    // default (keep-alive on this Node version), never the client's value.
    expect(captured["connection"]).not.toBe("close");
    for (const stripped of [
      "keep-alive",
      "proxy-authorization",
      "proxy-authenticate",
      "te",
      "upgrade",
    ]) {
      expect(captured[stripped]).toBeUndefined();
    }
    expect(captured["x-custom"]).toBe("kept");
  }, 15_000);

  it("refuses non-loopback server origins at construction (spec 5.9)", () => {
    for (const origin of ["http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001"]) {
      expect(() =>
        createSidecarProxy({ serverOrigin: origin, pageHandler })
      ).not.toThrow();
    }
    for (const origin of ["http://192.168.1.10:3001", "http://10.0.0.5:3001", "http://example.com:3001"]) {
      let failure: unknown = null;
      try {
        createSidecarProxy({ serverOrigin: origin, pageHandler });
      } catch (error: unknown) {
        failure = error;
      }
      expect(failure).not.toBeNull();
      const message = failure instanceof Error ? failure.message : String(failure);
      expect(message).toContain("loopback");
    }
  });

  it("returns typed JSON 502 (never HTML) when the server is down (spec 7.5)", async () => {
    // Reserve a loopback port, then close it: connecting fails fast.
    const held = createServer(() => undefined);
    const deadPort = await listen(held);
    await new Promise<void>((resolve) => held.close(() => resolve()));
    servers.pop();

    const proxy = createSidecarProxy({
      serverOrigin: `http://127.0.0.1:${deadPort}`,
      pageHandler,
    });
    const front = createServer((req: IncomingMessage, res: ServerResponse) => {
      void proxy.handleRequest(req, res).catch(() => undefined);
    });
    const frontPort = await listen(front);

    const res = await fetch(`http://127.0.0.1:${frontPort}/api/healthz`);
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as {
      error: { code: string; message: string; service: string };
    };
    expect(body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(body.error.service).toBe("server");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  }, 15_000);

  it("breaks (never fabricates) the client stream on mid-stream upstream failure", async () => {
    const origin = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: partial\n\n");
      setTimeout(() => res.destroy(), 200);
    });
    const originPort = await listen(origin);
    const proxy = await startProxy(originPort);

    // A truncated chunked stream cannot end cleanly: the break must surface.
    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/events`);
    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow();

    // The proxy survives: non-proxied traffic still serves.
    const page = await fetch(`http://127.0.0.1:${proxy.port}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<html>");
  }, 15_000);

  it("survives client abort: the run settles and later requests still proxy", async () => {
    const origin = createServer((req: IncomingMessage, res: ServerResponse) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    const originPort = await listen(origin);
    const proxy = createSidecarProxy({
      serverOrigin: `http://127.0.0.1:${originPort}`,
      pageHandler,
    });
    const front = createServer((req: IncomingMessage, res: ServerResponse) => {
      void proxy.handleRequest(req, res);
    });
    const frontPort = await listen(front);

    // Abort a slow upload mid-flight.
    const controller = new AbortController();
    const slowBody = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("chunk-1"));
      },
    });
    const aborted = fetch(`http://127.0.0.1:${frontPort}/api/upload`, {
      method: "POST",
      body: slowBody,
      duplex: "half",
      signal: controller.signal,
    } as RequestInit);
    await new Promise((resolve) => setTimeout(resolve, 200));
    controller.abort();
    await expect(aborted).rejects.toThrow();

    // The proxy is not wedged: a later request proxies normally.
    const res = await fetch(`http://127.0.0.1:${frontPort}/api/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("{}");
  }, 15_000);

  it("routes upgrades to the compiler handler, and rejects upgrades on API prefixes (spec 5.8)", async () => {
    const origin = await startOrigin();
    const heldSockets: Duplex[] = [];
    const proxy = createSidecarProxy({
      serverOrigin: `http://127.0.0.1:${origin.port}`,
      pageHandler,
      upgradeHandler: (_req, socket) => {
        heldSockets.push(socket);
        // Fake compiler HMR socket: accept the upgrade.
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"
        );
      },
    });
    const front = createServer((req: IncomingMessage, res: ServerResponse) => {
      void proxy.handleRequest(req, res);
    });
    front.on("upgrade", (req, socket, head) => {
      proxy.handleUpgrade(req, socket, head);
    });
    const frontPort = await listen(front);

    const { request: httpRequest } = await import("node:http");
    const attemptUpgrade = (path: string): Promise<{ upgraded: boolean }> =>
      new Promise((resolve) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port: frontPort,
          path,
          method: "GET",
          headers: { connection: "Upgrade", upgrade: "websocket" },
        });
        req.on("upgrade", () => resolve({ upgraded: true }));
        req.on("error", () => resolve({ upgraded: false }));
        req.on("close", () => resolve({ upgraded: false }));
        req.end();
      });

    // Dev-transport path reaches the compiler handler (101).
    expect(await attemptUpgrade("/_next/webpack-hmr")).toEqual({ upgraded: true });
    // API prefixes never receive upgrades: rejected, never proxied.
    expect(await attemptUpgrade("/api/socket")).toEqual({ upgraded: false });
    for (const socket of heldSockets) socket.destroy();
  }, 15_000);
});

describe("ticket 04: compiler adapter loads the pinned Next.js API", () => {
  it("pins Next 16.4.0 and selects webpack by default (spec 5.10)", async () => {
    const { createCompilerApp } = await import("../src/sidecar/adapter.js");
    const seenWebDirs: unknown[] = [];
    const receivedOptions: unknown[] = [];
    const prepareCalls: unknown[][] = [];
    const fakeApp = {
      prepare: (...args: unknown[]) => {
        prepareCalls.push(args);
        return Promise.resolve();
      },
      getRequestHandler: () => () => Promise.resolve(),
      getUpgradeHandler: () => () => undefined,
      close: () => Promise.resolve(),
    };
    const app = await createCompilerApp(
      { webDir: "/repo/apps/web", hostname: "127.0.0.1", port: 3001, bundler: "webpack" },
      {
        loadFactory: (webDir: string) => {
          seenWebDirs.push(webDir);
          return Promise.resolve({
            default: (opts: unknown) => {
              receivedOptions.push(opts);
              return fakeApp;
            },
          });
        },
        readPinnedVersion: () => "16.4.0",
      }
    );
    // The adapter narrows (wraps) the raw factory product and delegates.
    await app.prepare();
    expect(prepareCalls).toEqual([[]]);
    expect(typeof app.getRequestHandler()).toBe("function");
    expect(typeof app.getUpgradeHandler()).toBe("function");
    await app.close();
    // Factory loads anchored at the web workspace (never a root-level import).
    expect(seenWebDirs).toEqual(["/repo/apps/web"]);
    // The bundler flag is honored: shipped createServer bridges
    // options.webpack onto the environment before the compiler boots, while
    // an unset flag would default to Turbopack (TURBOPACK='auto'). The
    // factory's conf option is NOT passed: it is silently dropped on the
    // custom-server path (distDir comes from the next.config.ts branch).
    expect(receivedOptions).toEqual([
      { dev: true, dir: "/repo/apps/web", hostname: "127.0.0.1", port: 3001, webpack: true },
    ]);
  });

  it("selects Turbopack only for the explicit opt-in bundler (spec 5.10)", async () => {
    const { createCompilerApp } = await import("../src/sidecar/adapter.js");
    const receivedOptions: unknown[] = [];
    const fakeApp = {
      prepare: () => Promise.resolve(),
      getRequestHandler: () => () => Promise.resolve(),
      getUpgradeHandler: () => () => undefined,
      close: () => Promise.resolve(),
    };
    await createCompilerApp(
      { webDir: "/repo/apps/web", hostname: "127.0.0.1", port: 3001, bundler: "turbopack" },
      {
        loadFactory: () => Promise.resolve({ default: (opts: unknown) => {
          receivedOptions.push(opts);
          return fakeApp;
        } }),
        readPinnedVersion: () => "16.4.0",
      }
    );
    expect(receivedOptions).toEqual([
      { dev: true, dir: "/repo/apps/web", hostname: "127.0.0.1", port: 3001, turbopack: true },
    ]);
  });

  it("refuses an unexpected Next.js version (re-pin per ticket process)", async () => {
    const { createCompilerApp } = await import("../src/sidecar/adapter.js");
    await expect(
      createCompilerApp(
        { webDir: "/repo/apps/web", hostname: "127.0.0.1", port: 3001, bundler: "webpack" },
        {
          loadFactory: () => Promise.resolve({ default: () => ({}) }),
          readPinnedVersion: () => "15.0.0",
        }
      )
    ).rejects.toThrow(/16\.4\.0/);
  });
});

describe("ticket 04: web config carries an explicit sidecar branch", () => {
  const DIST_DIR_ENV = "NOTEBENCH_WEB_DIST_DIR";
  const DIST_DIR_ENV_ALIAS = "NB_WEB_DIST_DIR";

  async function loadWebConfig(): Promise<Record<string, unknown>> {
    // The config reads process.env at evaluation time: drop the module
    // cache so each load observes the current environment.
    vi.resetModules();
    const module = (await import("../../../apps/web/next.config.js")) as {
      default: Record<string, unknown>;
    };
    return module.default;
  }

  it("keeps the production export branch without sidecar env (spec 5.10)", async () => {
    delete process.env[DIST_DIR_ENV];
    delete process.env[DIST_DIR_ENV_ALIAS];
    const config = await loadWebConfig();
    expect(config["output"]).toBe("export");
    expect(config["distDir"]).toBe("out");
  });

  it("switches to the namespaced distDir with no static export under sidecar env", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    try {
      const config = await loadWebConfig();
      // The dev bundler joins distDir onto the app dir, so the branch
      // relativizes the absolute env value against apps/web.
      const { relative: rel, join: joinPath } = await import("node:path");
      const webDir = joinPath(process.cwd(), "apps", "web");
      expect(config["distDir"]).toBe(rel(webDir, "/tmp/build/ns/web-dist"));
      expect(config["output"]).toBeUndefined();
    } finally {
      delete process.env[DIST_DIR_ENV];
    }
  });

  it("accepts the NB_ alias for the sidecar distDir (spec 7.2)", async () => {
    delete process.env[DIST_DIR_ENV];
    process.env[DIST_DIR_ENV_ALIAS] = "/tmp/build/other/web-dist";
    try {
      const config = await loadWebConfig();
      const { relative: rel, join: joinPath } = await import("node:path");
      const webDir = joinPath(process.cwd(), "apps", "web");
      expect(config["distDir"]).toBe(rel(webDir, "/tmp/build/other/web-dist"));
      expect(config["output"]).toBeUndefined();
    } finally {
      delete process.env[DIST_DIR_ENV_ALIAS];
    }
  });
});

describe("ticket 04: sidecar entry resolves its environment", () => {
  it("uses Notebench-owned env names with NB_ aliases (spec 7.2)", async () => {
    const entry = await import("../src/sidecar/entry.js");
    expect(entry.SERVER_ORIGIN_ENV).toBe("NOTEBENCH_SERVER_ORIGIN");
    expect(entry.SERVER_ORIGIN_ENV_ALIAS).toBe("NB_SERVER_ORIGIN");
    expect(entry.WEB_DIST_DIR_ENV).toBe("NOTEBENCH_WEB_DIST_DIR");
    expect(entry.WEB_DIST_DIR_ENV_ALIAS).toBe("NB_WEB_DIST_DIR");
    expect(entry.WEB_DEV_BUNDLER_ENV).toBe("NOTEBENCH_WEB_DEV_BUNDLER");
    expect(entry.WEB_DEV_BUNDLER_ENV_ALIAS).toBe("NB_WEB_DEV_BUNDLER");
  });

  it("resolves origin/distDir/bundler with canonical-over-alias precedence", async () => {
    const { resolveSidecarEnv } = await import("../src/sidecar/entry.js");
    expect(
      resolveSidecarEnv({
        NOTEBENCH_SERVER_ORIGIN: "http://127.0.0.1:3001",
        NOTEBENCH_WEB_DIST_DIR: "/tmp/build/a",
      })
    ).toEqual({ serverOrigin: "http://127.0.0.1:3001", distDir: "/tmp/build/a", bundler: "webpack" });
    expect(
      resolveSidecarEnv({
        NB_SERVER_ORIGIN: "http://127.0.0.1:3002",
        NB_WEB_DIST_DIR: "/tmp/build/b",
        NB_WEB_DEV_BUNDLER: "turbopack",
      })
    ).toEqual({ serverOrigin: "http://127.0.0.1:3002", distDir: "/tmp/build/b", bundler: "turbopack" });
    expect(
      resolveSidecarEnv({
        NOTEBENCH_SERVER_ORIGIN: "http://127.0.0.1:3001",
        NB_SERVER_ORIGIN: "http://127.0.0.1:9999",
        NOTEBENCH_WEB_DIST_DIR: "/tmp/build/a",
        NB_WEB_DIST_DIR: "/tmp/build/z",
        NOTEBENCH_WEB_DEV_BUNDLER: "turbopack",
        NB_WEB_DEV_BUNDLER: "webpack",
      })
    ).toEqual({ serverOrigin: "http://127.0.0.1:3001", distDir: "/tmp/build/a", bundler: "turbopack" });
  });

  it("fails fast on missing origin, missing distDir, relative distDir, or unknown bundler", async () => {
    const { resolveSidecarEnv } = await import("../src/sidecar/entry.js");
    expect(() => resolveSidecarEnv({})).toThrow(/NOTEBENCH_SERVER_ORIGIN/);
    expect(() =>
      resolveSidecarEnv({ NOTEBENCH_SERVER_ORIGIN: "http://127.0.0.1:1" })
    ).toThrow(/NOTEBENCH_WEB_DIST_DIR/);
    expect(() =>
      resolveSidecarEnv({
        NOTEBENCH_SERVER_ORIGIN: "http://127.0.0.1:1",
        NOTEBENCH_WEB_DIST_DIR: "relative/path",
      })
    ).toThrow(/absolute/);
    expect(() =>
      resolveSidecarEnv({
        NOTEBENCH_SERVER_ORIGIN: "http://127.0.0.1:1",
        NOTEBENCH_WEB_DIST_DIR: "/tmp/build/a",
        NOTEBENCH_WEB_DEV_BUNDLER: "rspack",
      })
    ).toThrow(/bundler/);
  });

  it("maps the bundler onto TURBOPACK for the run and restores the environment on close", async () => {
    const { startSidecar } = await import("../src/sidecar/entry.js");
    const origin = await startOrigin();
    const fakeApp = {
      prepare: () => Promise.resolve(),
      getRequestHandler: () => (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>fake-compiler</body></html>");
      },
      getUpgradeHandler: () => () => undefined,
      close: () => Promise.resolve(),
    };
    const previousTurbopack = process.env["TURBOPACK"];
    const previousDistDir = process.env["NOTEBENCH_WEB_DIST_DIR"];

    const handle = await startSidecar({
      webDir: "/repo/apps/web",
      host: "127.0.0.1",
      port: 0,
      env: {
        NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${origin.port}`,
        NOTEBENCH_WEB_DIST_DIR: "/tmp/build/ns/web-dist",
        NOTEBENCH_WEB_DEV_BUNDLER: "turbopack",
      },
      createApp: () => Promise.resolve(fakeApp),
    });
    try {
      expect(process.env["TURBOPACK"]).toBe("1");
      expect(process.env["NOTEBENCH_WEB_DIST_DIR"]).toBe("/tmp/build/ns/web-dist");
      // Pages come from the compiler handler; APIs still reach the backend.
      const page = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(await page.text()).toContain("fake-compiler");
      const api = await fetch(`http://127.0.0.1:${handle.port}/api/x`);
      expect(JSON.parse(await api.text())).toMatchObject({ proxied: true });
    } finally {
      await handle.close();
    }
    expect(process.env["TURBOPACK"]).toBe(previousTurbopack);
    expect(process.env["NOTEBENCH_WEB_DIST_DIR"]).toBe(previousDistDir);
  }, 15_000);

  it("leaves TURBOPACK unset for the webpack default", async () => {
    const { startSidecar } = await import("../src/sidecar/entry.js");
    const origin = await startOrigin();
    const fakeApp = {
      prepare: () => Promise.resolve(),
      getRequestHandler: () => (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html></html>");
      },
      getUpgradeHandler: () => () => undefined,
      close: () => Promise.resolve(),
    };
    process.env["TURBOPACK"] = "leaked-1";
    const handle = await startSidecar({
      webDir: "/repo/apps/web",
      host: "127.0.0.1",
      port: 0,
      env: {
        NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${origin.port}`,
        NOTEBENCH_WEB_DIST_DIR: "/tmp/build/ns/web-dist",
      },
      createApp: () => Promise.resolve(fakeApp),
    });
    try {
      expect(process.env["TURBOPACK"]).toBeUndefined();
      const page = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(page.status).toBe(200);
    } finally {
      await handle.close();
    }
    // The leaked marker is restored, not dropped.
    expect(process.env["TURBOPACK"]).toBe("leaked-1");
    delete process.env["TURBOPACK"];
  }, 15_000);
});

describe("ticket 04: sidecar boots the real compiler from source", () => {
  // One namespaced output dir per worker for all boots in this file: Next
  // caches the loaded file config per (phase, dir) in-module, so sequential
  // boots with different distDirs would reuse the first boot's config
  // (shipped config.js configCache). Sharing is also faster (warm cache).
  // Staged under the canonical build root (spec 5.5), removed by the
  // file's temp cleanup.
  let sharedDistDir = "";
  beforeAll(() => {
    const base = join(process.cwd(), ".tmp", "build", "sidecar-shared");
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, "ns-"));
    tempRoots.push(dir);
    sharedDistDir = join(dir, "web-dist");
  });

  // The export-moved test runs before any other boot in this worker: a
  // just-closed compiler can hold the app tree's directory handles for many
  // seconds on Windows, which would block parking apps/web/out.
  it("serves with the production export directory moved away (spec 5.10)", async () => {
    const { startSidecar } = await import("../src/sidecar/entry.js");
    const { renameSync } = await import("node:fs");
    const root = process.cwd();
    const webDir = join(root, "apps", "web");
    const exportDir = join(webDir, "out");
    // Park under the canonical build root, outside the watched app tree
    // (never registered for temp cleanup: these are production files,
    // restored in the finally below).
    const stageDir = join(root, ".tmp", "build", "sidecar-parked");
    mkdirSync(stageDir, { recursive: true });
    const parkedDir = join(stageDir, "out");
    const distDir = sharedDistDir;
    const origin = await startOrigin();

    if (!existsSync(exportDir)) {
      throw new Error(
        `apps/web/out is missing: a previous crashed run may have staged it at ${parkedDir}; restore it before running this test.`
      );
    }
    rmSync(parkedDir, { recursive: true, force: true });
    // Parking can collide with a virus scanner pass: retry briefly. The
    // rename is atomic, so a failed park leaves the tree untouched.
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(exportDir, parkedDir);
        break;
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if ((code === "EPERM" || code === "EBUSY") && attempt < 20) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        throw error;
      }
    }
    try {
      const handle = await startSidecar({
        webDir,
        host: "127.0.0.1",
        port: 0,
        env: {
          NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${origin.port}`,
          NOTEBENCH_WEB_DIST_DIR: distDir,
        },
      });
      try {
        const page = await fetch(`http://127.0.0.1:${handle.port}/`);
        expect(page.status).toBe(200);
        expect(await page.text()).toContain("<html");
      } finally {
        await handle.close();
      }
    } finally {
      // Windows releases directory handles asynchronously after close:
      // retry the restore briefly before giving up.
      for (let attempt = 0; ; attempt += 1) {
        try {
          renameSync(parkedDir, exportDir);
          break;
        } catch (error: unknown) {
          const code = (error as { code?: string }).code;
          if ((code === "EPERM" || code === "EBUSY") && attempt < 20) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw error;
        }
      }
    }
    expect(existsSync(exportDir)).toBe(true);
  }, 180_000);

  it("prepares before listening and serves pages through proxy-before-Next", async () => {
    const { startSidecar } = await import("../src/sidecar/entry.js");
    const root = process.cwd();
    const webDir = join(root, "apps", "web");
    const distDir = sharedDistDir;
    const origin = await startOrigin();

    const handle = await startSidecar({
      webDir,
      host: "127.0.0.1",
      port: 0,
      env: {
        NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${origin.port}`,
        NOTEBENCH_WEB_DIST_DIR: distDir,
      },
    });
    try {
      // Pages come from the freshly prepared compiler, not the export dir.
      const page = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("<html");
      // API prefixes still reach the live backend through the same listener.
      const api = await fetch(`http://127.0.0.1:${handle.port}/api/healthz`);
      expect(api.status).toBe(200);
      expect(JSON.parse(await api.text())).toMatchObject({ proxied: true });
      // The namespaced compiler output received files (config-branch proof).
      expect(existsSync(distDir)).toBe(true);
      // Webpack stays selected: nothing re-armed TURBOPACK behind us
      // (an unset flag would have defaulted to Turbopack auto mode).
      expect(process.env["TURBOPACK"]).toBeUndefined();
      // The unified HMR endpoint upgrades through the sidecar, proving the
      // dev-transport upgrade path is intact (spec 5.8). Only a valid
      // websocket handshake is answered; a bare Upgrade is held, so the
      // attempt carries a deadline instead of hanging.
      const { connect } = await import("node:net");
      const upgraded = await new Promise<boolean>((resolve) => {
        const done = (value: boolean): void => {
          clearTimeout(timer);
          resolve(value);
        };
        const timer = setTimeout(() => {
          socket.destroy();
          done(false);
        }, 15_000);
        const socket = connect(handle.port, "127.0.0.1", () => {
          socket.write(
            "GET /_next/hmr HTTP/1.1\r\n" +
              `Host: 127.0.0.1:${handle.port}\r\n` +
              "Connection: Upgrade\r\n" +
              "Upgrade: websocket\r\n" +
              "Sec-WebSocket-Version: 13\r\n" +
              "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
              "\r\n"
          );
        });
        let head = "";
        socket.on("data", (chunk: Buffer) => {
          head += chunk.toString("utf-8");
          const end = head.indexOf("\r\n\r\n");
          if (end !== -1) {
            const statusLine = head.slice(0, head.indexOf("\r\n"));
            socket.destroy();
            done(statusLine.includes("101"));
          }
        });
        socket.on("error", () => done(false));
        socket.on("close", () => done(false));
      });
      expect(upgraded).toBe(true);
    } finally {
      await handle.close();
    }
  }, 180_000);

  it("writes no compiler output inside the web package (spec 5.5, 5.10)", async () => {
    const { startSidecar } = await import("../src/sidecar/entry.js");
    const { readdir } = await import("node:fs/promises");
    const { relative: relPath } = await import("node:path");
    const root = process.cwd();
    const webDir = join(root, "apps", "web");
    const listAppTree = async (): Promise<string[]> => {
      const out: string[] = [];
      const stack: string[] = [webDir];
      while (stack.length > 0) {
        const current = stack.pop() as string;
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "node_modules") continue;
          const full = join(current, entry.name);
          out.push(relPath(webDir, full));
          if (entry.isDirectory()) stack.push(full);
        }
      }
      return out.sort();
    };

    const before = await listAppTree();
    expect(before.length).toBeGreaterThan(0);
    const distDir = sharedDistDir;
    const origin = await startOrigin();
    const handle = await startSidecar({
      webDir,
      host: "127.0.0.1",
      port: 0,
      env: {
        NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${origin.port}`,
        NOTEBENCH_WEB_DIST_DIR: distDir,
      },
    });
    try {
      const page = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(page.status).toBe(200);
      await page.text();
    } finally {
      await handle.close();
    }
    expect(await listAppTree()).toEqual(before);
  }, 180_000);
});

describe("ticket 04: composer supervises the sidecar under one run", () => {
  const WEB_HEALTHY_SCRIPT = `
const http = require("http");
const port = Number(process.env["PORT"]);
const host = process.env["HOST"] || "127.0.0.1";
console.log("ORIGIN=" + process.env["NOTEBENCH_SERVER_ORIGIN"]);
console.log("DISTDIR=" + process.env["NOTEBENCH_WEB_DIST_DIR"]);
http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>web</html>");
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host);
`;

  const SERVER_HEALTHY_SCRIPT = `
const http = require("http");
const port = Number(process.env["PORT"]);
const host = process.env["HOST"] || "127.0.0.1";
http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host);
`;

  const WEB_CRASHING_SCRIPT = `
console.log("web-boot-marker");
setTimeout(() => { console.error("web-fatal-error"); process.exit(1); }, 400);
setInterval(() => {}, 1000);
`;

  // Passes the health gate first, then crashes mid-run (after the web
  // phase is up): exercises sibling teardown in the live state.
  const SERVER_CRASHING_SCRIPT = `
const http = require("http");
console.log("server-boot-marker");
http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(Number(process.env["PORT"]), process.env["HOST"] || "127.0.0.1");
setTimeout(() => { console.error("server-fatal-error"); process.exit(1); }, 5000);
setInterval(() => {}, 1000);
`;

  function silentLogs(): { lines: string[]; logLine: (line: string) => void } {
    const lines: string[] = [];
    return { lines, logLine: (line: string) => lines.push(line) };
  }

  async function pollPortFile(path: string, timeoutMs: number): Promise<string> {
    const start = Date.now();
    for (;;) {
      try {
        const content = readFileSync(path, "utf-8").trim();
        if (content !== "") return content;
      } catch {
        // Not written yet.
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timed out waiting for ${path}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function expectRefused(url: string): Promise<void> {
    let refused = false;
    try {
      await fetch(url);
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  }

  it("starts the sidecar after server health and publishes web records", async () => {
    const { runDevCommand } = await import("../src/composer.js");
    const { resolveRunPaths } = await import("../src/paths.js");
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "web-ns");
    const handlers = new Map<string, () => void>();

    const runPromise = runDevCommand(
      { root, argv: ["--namespace", "web-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", SERVER_HEALTHY_SCRIPT] }),
        createWebSpawn: () => ({ executable: process.execPath, argv: ["-e", WEB_HEALTHY_SCRIPT] }),
        onSignal: (signal: string, handler: () => void) => {
          handlers.set(signal, handler);
        },
      }
    );
    try {
      const webPort = await pollPortFile(paths.webPortFile, 30_000);
      expect(Number(webPort)).toBeGreaterThan(0);
      // Route-ready: a real request through the sidecar serves the page.
      const page = await fetch(`http://127.0.0.1:${webPort}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("web");
      // Records: web port/PID files plus a joint run identity.
      expect(readFileSync(paths.webPortFile, "utf-8").trim()).toBe(webPort);
      expect(Number(readFileSync(paths.webPidFile, "utf-8").trim())).toBeGreaterThan(0);
      const identity = JSON.parse(readFileSync(paths.identityFile, "utf-8")) as {
        children: Record<string, unknown>;
      };
      expect(identity.children["server"]).toBeDefined();
      expect(identity.children["web"]).toBeDefined();
      // The sidecar child received the live origin and namespaced distDir.
      const webLog = readFileSync(paths.webLogFile, "utf-8");
      expect(webLog).toMatch(/^ORIGIN=http:\/\/127\.0\.0\.1:\d+$/m);
      expect(webLog).toContain(`DISTDIR=${paths.buildDir}`);
    } finally {
      handlers.get("SIGINT")?.();
      await expect(runPromise).resolves.toBe(0);
    }
    expect(lines.join("\n")).toContain("[web]");
    expect(existsSync(paths.webPortFile)).toBe(false);
    expect(existsSync(paths.webPidFile)).toBe(false);
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 60_000);

  it("gates the run on sidecar route-ready instead of starting blind", async () => {
    const { runDevCommand } = await import("../src/composer.js");
    const { resolveRunPaths } = await import("../src/paths.js");
    const root = makeTempRoot();
    const { logLine } = silentLogs();
    const paths = resolveRunPaths(root, "gate-ns");
    const handlers = new Map<string, () => void>();
    const flakyThenHealthy = `
const http = require("http");
let count = 0;
http.createServer((req, res) => {
  if (req.url === "/") {
    count += 1;
    if (count < 3) { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>web</html>");
  } else { res.writeHead(404); res.end(); }
}).listen(Number(process.env["PORT"]), process.env["HOST"] || "127.0.0.1");
`;

    const runPromise = runDevCommand(
      { root, argv: ["--namespace", "gate-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", SERVER_HEALTHY_SCRIPT] }),
        createWebSpawn: () => ({ executable: process.execPath, argv: ["-e", flakyThenHealthy] }),
        onSignal: (signal: string, handler: () => void) => {
          handlers.set(signal, handler);
        },
      }
    );
    try {
      // The port file appears only after the probe succeeds (third attempt).
      const webPort = await pollPortFile(paths.webPortFile, 30_000);
      const page = await fetch(`http://127.0.0.1:${webPort}/`);
      expect(page.status).toBe(200);
    } finally {
      handlers.get("SIGINT")?.();
      await expect(runPromise).resolves.toBe(0);
    }
  }, 60_000);

  it("times out with exit 4, the tail, and no owned state when the sidecar never listens", async () => {
    const { runDevCommand } = await import("../src/composer.js");
    const { resolveRunPaths } = await import("../src/paths.js");
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "webhang-ns");

    const code = await runDevCommand(
      { root, argv: ["--namespace", "webhang-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", SERVER_HEALTHY_SCRIPT] }),
        createWebSpawn: () => ({ executable: process.execPath, argv: ["-e", "setInterval(() => {}, 1000);"] }),
        webDeadlineMs: 1200,
        pollIntervalMs: 100,
      }
    );
    expect(code).toBe(4);
    expect(lines.join("\n")).toContain("[web]");
    expect(existsSync(paths.serverPortFile)).toBe(false);
    expect(existsSync(paths.webPortFile)).toBe(false);
    expect(existsSync(paths.serverPidFile)).toBe(false);
    expect(existsSync(paths.webPidFile)).toBe(false);
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 60_000);

  it("stops the server with exit 1 when the sidecar crashes", async () => {
    const { runDevCommand } = await import("../src/composer.js");
    const { resolveRunPaths } = await import("../src/paths.js");
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "webcrash-ns");

    const runPromise = runDevCommand(
      { root, argv: ["--namespace", "webcrash-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", SERVER_HEALTHY_SCRIPT] }),
        createWebSpawn: () => ({ executable: process.execPath, argv: ["-e", WEB_CRASHING_SCRIPT] }),
      }
    );
    const serverPort = await pollPortFile(paths.serverPortFile, 30_000);
    const code = await runPromise;
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("web-fatal-error");
    await expectRefused(`http://127.0.0.1:${serverPort}/healthz`);
    expect(existsSync(paths.webPortFile)).toBe(false);
    expect(existsSync(paths.identityFile)).toBe(false);
  }, 60_000);

  it("stops the sidecar with exit 1 when the server crashes", async () => {
    const { runDevCommand } = await import("../src/composer.js");
    const { resolveRunPaths } = await import("../src/paths.js");
    const root = makeTempRoot();
    const { lines, logLine } = silentLogs();
    const paths = resolveRunPaths(root, "servercrash-ns");

    const runPromise = runDevCommand(
      { root, argv: ["--namespace", "servercrash-ns"], env: {} },
      {
        logLine,
        runBuild: () => undefined,
        createServerSpawn: () => ({ executable: process.execPath, argv: ["-e", SERVER_CRASHING_SCRIPT] }),
        createWebSpawn: () => ({ executable: process.execPath, argv: ["-e", WEB_HEALTHY_SCRIPT] }),
      }
    );
    // Wait until the web phase published its port, proving both ran.
    const webPort = await pollPortFile(paths.webPortFile, 30_000);
    const code = await runPromise;
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("server-fatal-error");
    await expectRefused(`http://127.0.0.1:${webPort}/`);
    expect(existsSync(paths.serverPortFile)).toBe(false);
    expect(existsSync(paths.webPortFile)).toBe(false);
  }, 60_000);
});
