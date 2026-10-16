import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import getPort from "get-port";
import { makeTempRoot as createTempRoot, removeTempRoots } from "./temp-dir.js";

/**
 * Ticket 04 suites after the CLI cutover (open-design parity): the web
 * child runs the real `next dev` CLI, so the genuine Next.js startup block
 * comes from Next itself.
 *
 * Seams under test (public boundaries only):
 * - config: apps/web/next.config.js sidecar branch observed by evaluation
 *   (distDir isolation, API-split rewrites, loopback refusal).
 * - composer: web-phase supervision observed via real processes running
 *   fixture entries (order, records, reverse teardown, crashes).
 * - cli: one real `next dev` boot proving pages serve and /api reaches the
 *   backend through the config rewrites.
 * - contract pins: spec literals (env names, exit codes).
 *
 * Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
 */

const servers: Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop() as Server;
    // Closing can transiently fail while the machine is saturated; retry
    // lock errors briefly. An already-closed server is not an error.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error: unknown) => {
            if (error instanceof Error) reject(error);
            else resolve();
          });
        });
        break;
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code === "ERR_SERVER_NOT_RUNNING") break;
        if ((code === "EPERM" || code === "EBUSY") && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        throw error;
      }
    }
  }
});

const tempRoots: string[] = [];

function makeTempRoot(): string {
  return createTempRoot(tempRoots, "notebench-sidecar-");
}

afterEach(() => removeTempRoots(tempRoots), 120_000);

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

  it("rewrites /api, /artifacts, /frames to the server origin under sidecar env", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    process.env["NOTEBENCH_SERVER_ORIGIN"] = "http://127.0.0.1:57570";
    try {
      const config = await loadWebConfig();
      expect(typeof config["rewrites"]).toBe("function");
      const rules = (await (config["rewrites"] as () => Promise<unknown[]>)()) as Array<{
        source: string;
        destination: string;
      }>;
      const pairs = rules.map((rule) => `${rule.source} -> ${rule.destination}`);
      for (const prefix of ["/api", "/artifacts", "/frames"]) {
        expect(pairs).toContain(`${prefix} -> http://127.0.0.1:57570${prefix}`);
        expect(pairs).toContain(
          `${prefix}/:path* -> http://127.0.0.1:57570${prefix}/:path*`
        );
      }
    } finally {
      delete process.env[DIST_DIR_ENV];
      delete process.env["NOTEBENCH_SERVER_ORIGIN"];
    }
  });

  it("accepts the NB_ alias for the server origin", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    process.env["NB_SERVER_ORIGIN"] = "http://localhost:4123";
    try {
      const config = await loadWebConfig();
      const rules = (await (config["rewrites"] as () => Promise<unknown[]>)()) as Array<{
        destination: string;
      }>;
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.destination.startsWith("http://localhost:4123")).toBe(true);
      }
    } finally {
      delete process.env[DIST_DIR_ENV];
      delete process.env["NB_SERVER_ORIGIN"];
    }
  });

  it("refuses a non-loopback server origin at config load", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    process.env["NOTEBENCH_SERVER_ORIGIN"] = "https://example.com";
    try {
      await expect(loadWebConfig()).rejects.toThrow();
    } finally {
      delete process.env[DIST_DIR_ENV];
      delete process.env["NOTEBENCH_SERVER_ORIGIN"];
    }
  });

  it("accepts IPv6 loopback http://[::1] (Node keeps brackets in hostname)", async () => {
    process.env[DIST_DIR_ENV] = "/tmp/build/ns/web-dist";
    process.env["NOTEBENCH_SERVER_ORIGIN"] = "http://[::1]:57570";
    try {
      const config = await loadWebConfig();
      expect(typeof config["rewrites"]).toBe("function");
      const rules = (await (config["rewrites"] as () => Promise<unknown[]>)()) as Array<{
        destination: string;
      }>;
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.destination.startsWith("http://[::1]:57570")).toBe(true);
      }
    } finally {
      delete process.env[DIST_DIR_ENV];
      delete process.env["NOTEBENCH_SERVER_ORIGIN"];
    }
  });

  it("exposes no rewrites on the production export branch", async () => {
    delete process.env[DIST_DIR_ENV];
    delete process.env[DIST_DIR_ENV_ALIAS];
    delete process.env["NOTEBENCH_SERVER_ORIGIN"];
    delete process.env["NB_SERVER_ORIGIN"];
    const config = await loadWebConfig();
    expect(config["rewrites"]).toBeUndefined();
  });
});

describe("ticket 04: web child runs the real Next.js CLI", () => {
  async function killTree(child: ChildProcess): Promise<void> {
    const pid = child.pid;
    if (pid === undefined) return;
    if (process.platform === "win32") {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      try {
        await promisify(execFile)("taskkill", ["/T", "/F", "/PID", String(pid)], {
          shell: false,
          windowsHide: true,
        });
      } catch {
        // Already gone.
      }
      return;
    }
    try {
      process.kill(0 - pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }

  it("serves pages from the CLI and rewrites /api to the backend (turbopack)", async () => {
    const { resolveNextBin } = await import("../src/composer.js");
    const backendHits: string[] = [];
    const backend = createServer((req, res) => {
      backendHits.push(req.url ?? "");
      if (req.url === "/api/sse") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        let n = 0;
        const timer = setInterval(() => {
          n += 1;
          res.write(`data: chunk${n}\n\n`);
          if (n >= 3) {
            clearInterval(timer);
            res.end();
          }
        }, 300);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ marker: "backend-v1", url: req.url }));
    });
    servers.push(backend);
    const backendPort = await listen(backend);
    const webDir = join(process.cwd(), "apps", "web");
    // distDir must live inside the workspace: the real CLI rejects
    // out-of-tree distDirs (InvalidDistDirError). Production already does
    // this (.tmp/build/<ns>/web-dist); the test mirrors it.
    const distNsDir = join(process.cwd(), ".tmp", "build", "cli-e2e-ns");
    const distDir = join(distNsDir, "web-dist");
    const nextDirBefore = existsSync(join(webDir, ".next"));
    const webPort = await getPort({ host: "127.0.0.1" });
    const bootT0 = Date.now();
    const child = spawn(
      process.execPath,
      [resolveNextBin(webDir), "dev", webDir, "-H", "127.0.0.1", "-p", String(webPort), "--turbopack"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOTEBENCH_WEB_DIST_DIR: distDir,
          NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${backendPort}`,
        },
        stdio: "pipe",
        detached: process.platform !== "win32",
        windowsHide: false,
      }
    );
    // Drain pipes (an unconsumed pipe can block the child) and keep the tail
    // for the failure message.
    const tail: string[] = [];
    const remember = (chunk: unknown): void => {
      for (const line of String(chunk).split("\n")) {
        const trimmed = line.trim();
        if (trimmed !== "") {
          tail.push(trimmed);
          if (tail.length > 40) tail.shift();
        }
      }
    };
    child.stdout?.on("data", remember);
    child.stderr?.on("data", remember);
    child.on("error", (error: unknown) => {
      remember(`spawn error: ${error instanceof Error ? error.message : String(error)}`);
    });
    try {
      const deadline = Date.now() + 180_000;
      let pageOk = false;
      let apiOk = false;
      while (Date.now() < deadline && !(pageOk && apiOk)) {
        try {
          const page = await fetch(`http://127.0.0.1:${webPort}/`);
          if (page.status === 200 && (await page.text()).includes("<html")) pageOk = true;
          const api = await fetch(`http://127.0.0.1:${webPort}/api/smoke`);
          if (api.status === 200) {
            const body = (await api.json()) as { marker?: string };
            if (body.marker === "backend-v1") apiOk = true;
          }
        } catch {
          // Not listening yet.
        }
        if (!(pageOk && apiOk)) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!(pageOk && apiOk)) {
        console.log(`CLI tail:\n${tail.join("\n")}`);
      }
      expect(pageOk).toBe(true);
      expect(apiOk).toBe(true);
      console.log(
        `[cli-e2e] turbopack route-ready in ${String(Date.now() - bootT0)}ms`
      );

      // Boundary (spec 5.9): /apix is never rewritten to the backend.
      backendHits.length = 0;
      const apix = await fetch(`http://127.0.0.1:${webPort}/apix`);
      const apixBody = await apix.text();
      expect(backendHits.some((hit) => hit === "/apix")).toBe(false);
      expect(apixBody.includes("backend-v1")).toBe(false);

      // SSE (spec 5.9): the rewrite streams chunks incrementally. Identity
      // encoding: undici gunzips whole bodies before yielding, which would
      // mask proxy streaming; browsers gunzip incrementally instead.
      const sseStart = Date.now();
      const sseRes = await fetch(`http://127.0.0.1:${webPort}/api/sse`, {
        headers: { "accept-encoding": "identity" },
      });
      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get("content-type") ?? "").toContain("text/event-stream");
      const sseBody = sseRes.body;
      if (sseBody === null) throw new Error("SSE response has no body");
      const reader = sseBody.getReader();
      const decoder = new TextDecoder();
      let sseText = "";
      let chunks = 0;
      let firstChunkMs = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (value !== undefined) {
          chunks += 1;
          if (firstChunkMs < 0) firstChunkMs = Date.now() - sseStart;
          sseText += decoder.decode(value, { stream: true });
        }
        if (done) break;
      }
      const sseTotalMs = Date.now() - sseStart;
      console.log(
        `[cli-e2e] sse: status=${String(sseRes.status)} ` +
          `enc=${sseRes.headers.get("content-encoding") ?? "-"} ` +
          `chunks=${String(chunks)} firstChunkMs=${String(firstChunkMs)} totalMs=${String(sseTotalMs)}`
      );
      expect(chunks).toBeGreaterThanOrEqual(2);
      expect(firstChunkMs).toBeGreaterThanOrEqual(0);
      expect(firstChunkMs).toBeLessThan(sseTotalMs);
      expect(sseText).toContain("chunk1");
      expect(sseText).toContain("chunk3");

      // Upgrades: HMR transport flows through the CLI root; API upgrades
      // never come back 101 (the backend has no socket handler, so a 101
      // here would mean the CLI upgraded an API path itself).
      async function probeUpgrade(path: string): Promise<string> {
        return new Promise((resolve) => {
          const sock = net.connect(webPort, "127.0.0.1", () => {
            sock.write(
              `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${webPort}\r\n` +
                `Connection: Upgrade\r\nUpgrade: websocket\r\n` +
                `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
                `Sec-WebSocket-Version: 13\r\n\r\n`
            );
          });
          let data = "";
          const timer = setTimeout(() => {
            sock.destroy();
            resolve(`timeout:${data.slice(0, 80)}`);
          }, 8000);
          sock.on("data", (chunk: Buffer) => {
            data += chunk.toString("utf-8");
            if (data.includes("\r\n\r\n")) {
              clearTimeout(timer);
              const statusLine = data.split("\r\n")[0] ?? "";
              sock.destroy();
              resolve(statusLine);
            }
          });
          sock.on("close", () => {
            clearTimeout(timer);
            if (data === "") resolve("destroyed-no-response");
          });
          sock.on("error", (error: Error) => {
            clearTimeout(timer);
            resolve(`error:${error.message}`);
          });
        });
      }
      // HMR lives at `<prefix>/_next/hmr` (router-server.js); API upgrades
      // are proxied to the backend (httpxy ws:true) instead of refused —
      // the backend drops them, so never 101.
      expect(await probeUpgrade("/_next/hmr")).toContain("101");
      expect(await probeUpgrade("/api/smoke")).not.toContain("101");

      // Backend down (spec story 8): outage is a 5xx, never an HTML page.
      await new Promise<void>((resolve) => backend.close(() => resolve()));
      await new Promise((resolve) => setTimeout(resolve, 500));
      const down = await fetch(`http://127.0.0.1:${webPort}/api/smoke`);
      const downBody = await down.text();
      console.log(
        `[cli-e2e] backend-down: status=${String(down.status)} ` +
          `ctype=${down.headers.get("content-type") ?? ""} body=${downBody.slice(0, 200)}`
      );
      expect(down.status).toBeGreaterThanOrEqual(500);
      expect(down.headers.get("content-type") ?? "").not.toContain("text/html");
      // Compiler output stays namespaced (spec 5.5): the run's distDir
      // receives files, and no fresh `.next` appears in the web package
      // (guarded: a stale pre-existing dir is the environment's, not ours).
      const { readdirSync } = await import("node:fs");
      expect(readdirSync(distDir).length).toBeGreaterThan(0);
      if (!nextDirBefore) expect(existsSync(join(webDir, ".next"))).toBe(false);
    } finally {
      await killTree(child);
      const { rmSync } = await import("node:fs");
      try {
        rmSync(distNsDir, { recursive: true, force: true });
      } catch {
        // Disposable state; best-effort cleanup only.
      }
    }
  }, 240_000);
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
  }, 180_000);

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
  }, 180_000);

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
  }, 180_000);

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
  }, 180_000);

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
  }, 180_000);
});
