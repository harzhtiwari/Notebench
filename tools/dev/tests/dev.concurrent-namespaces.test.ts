import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runDevCommand } from "../src/composer.js";
import type { BackendPhaseDeps } from "../src/composer.js";
import { resolveRunPaths } from "../src/paths.js";
import type { RunPaths } from "../src/paths.js";
import { makeTempRoot as createTempRoot, removeTempRoots } from "./temp-dir.js";

/**
Spec story 5 (section 9 story-to-test matrix): "two namespaces run
concurrently with disjoint ports, logs, build dirs — real processes".

Existing coverage was path arithmetic only (`dev.test.ts`); this suite
starts two full `runDevCommand` runs under one workspace root at the same
time, each with real node fixture children, and observes the isolation
end to end: records, live HTTP, log files, compiler build dirs, and
namespace-scoped teardown (spec 5.5, 7.3, 7.6, 5.14).

Seams under test (public boundaries only): `runDevCommand` observed via
`resolveRunPaths` records and live fixture responses. Signal delivery is
injected per run; real process signals are never used.
*/

const tempRoots: string[] = [];

function makeTempRoot(): string {
  return createTempRoot(tempRoots, "notebench-concurrent-");
}

afterEach(() => removeTempRoots(tempRoots), 120_000);

/**
Server fixture: answers the health gate, names its own namespace.
*/
function makeServerScript(namespace: string): string {
  return `
const http = require("http");
const NS = ${JSON.stringify(namespace)};
const port = Number(process.env["PORT"]);
const host = process.env["HOST"] || "127.0.0.1";
console.log("SERVER_NS=" + NS);
http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ns: NS }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host);
`;
}

/**
Web fixture: page body names the namespace, stdout echoes PORT + distDir.
*/
function makeWebScript(namespace: string): string {
  return `
const http = require("http");
const NS = ${JSON.stringify(namespace)};
const port = Number(process.env["PORT"]);
const host = process.env["HOST"] || "127.0.0.1";
const distDir = process.env["NOTEBENCH_WEB_DIST_DIR"] || "";
console.log("WEB_NS=" + NS);
console.log("DISTDIR=" + distDir);
console.log("PORT=" + String(port));
http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>WEB_NS=" + NS + "</html>");
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, host);
`;
}

interface ConcurrentRun {
  namespace: string;
  paths: RunPaths;
  lines: string[];
  handlers: Map<string, () => void>;
  promise: Promise<number>;
}

/**
One full orchestrator run: fake spawns, captured logs, captured signals.
*/
function startRun(root: string, namespace: string): ConcurrentRun {
  const paths = resolveRunPaths(root, namespace);
  const lines: string[] = [];
  const handlers = new Map<string, () => void>();
  const deps: BackendPhaseDeps = {
    logLine: (line: string) => {
      lines.push(line);
    },
    runBuild: () => {},
    createServerSpawn: () => ({
      executable: process.execPath,
      argv: ["-e", makeServerScript(namespace)],
    }),
    createWebSpawn: () => ({
      executable: process.execPath,
      argv: ["-e", makeWebScript(namespace)],
    }),
    onSignal: (signal: string, handler: () => void) => {
      handlers.set(signal, handler);
    },
  };
  const promise = runDevCommand({ root, argv: ["--namespace", namespace], env: {} }, deps);
  return { namespace, paths, lines, handlers, promise };
}

/**
The five owned records teardown removes (spec 5.5/7.3): ports, PIDs, identity.
*/
function ownedRecordFiles(paths: RunPaths): string[] {
  return [
    paths.serverPortFile,
    paths.webPortFile,
    paths.serverPidFile,
    paths.webPidFile,
    paths.identityFile,
  ];
}

async function pollPortFile(path: string): Promise<string> {
  const timeoutMs = 90_000;
  const start = Date.now();
  for (;;) {
    try {
      const content = readFileSync(path, "utf8").trim();
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

/**
Wait until the log file carries the last line the fixture prints.
*/
async function pollFileIncluding(
  path: string,
  needle: string
): Promise<string> {
  const timeoutMs = 15_000;
  const start = Date.now();
  for (;;) {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      content = "";
    }
    if (content.includes(needle)) return content;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for "${needle}" in ${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function pollSignalHandler(
  handlers: Map<string, () => void>
): Promise<() => void> {
  const timeoutMs = 30_000;
  const signal = "SIGINT";
  const start = Date.now();
  for (;;) {
    const handler = handlers.get(signal);
    if (handler !== undefined) return handler;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for the captured ${signal} handler`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function expectRefused(url: string): Promise<void> {
  let isRefused = false;
  try {
    await fetch(url);
  } catch {
    isRefused = true;
  }
  expect(isRefused).toBe(true);
}

/**
First line in `content` shaped `KEY=value`, or null.
*/
function echoedValue(content: string, key: string): string | null {
  const prefix = `${key}=`;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
  return null;
}

describe("spec story 5: two namespaces run concurrently under one root", () => {
  it(
    "keeps ports, logs, and build dirs disjoint and stops only the namespace asked to stop",
    async () => {
      const root = makeTempRoot();
      const runA = startRun(root, "conc-a");
      const runB = startRun(root, "conc-b");
      try {
        // 1. Both runs reach route-ready (spec 5.11): the web port record
        //    appears only after a real request through each web child.
        const [webPortA, webPortB] = await Promise.all([
          pollPortFile(runA.paths.webPortFile),
          pollPortFile(runB.paths.webPortFile),
        ]);
        const pageA = await fetch(`http://127.0.0.1:${webPortA}/`);
        const pageB = await fetch(`http://127.0.0.1:${webPortB}/`);
        expect(pageA.status).toBe(200);
        expect(pageB.status).toBe(200);
        const bodyA = await pageA.text();
        const bodyB = await pageB.text();
        expect(bodyA).toContain("WEB_NS=conc-a");
        expect(bodyA).not.toContain("conc-b");
        expect(bodyB).toContain("WEB_NS=conc-b");
        expect(bodyB).not.toContain("conc-a");

        // 2. Ports are disjoint, and each recorded pair actually serves its
        //    own namespace (read from the records, never guessed).
        const serverPortA = readFileSync(runA.paths.serverPortFile, "utf8").trim();
        const serverPortB = readFileSync(runB.paths.serverPortFile, "utf8").trim();
        expect(Number(serverPortA)).toBeGreaterThan(0);
        expect(Number(serverPortB)).toBeGreaterThan(0);
        expect(serverPortA).not.toBe(serverPortB);
        expect(webPortA).not.toBe(webPortB);
        const healthA = await fetch(`http://127.0.0.1:${serverPortA}/healthz`);
        const healthB = await fetch(`http://127.0.0.1:${serverPortB}/healthz`);
        expect(healthA.status).toBe(200);
        expect(healthB.status).toBe(200);
        expect(await healthA.text()).toContain("conc-a");
        expect(await healthB.text()).toContain("conc-b");

        // Per-run console capture stays per run.
        const linesA = runA.lines.join("\n");
        const linesB = runB.lines.join("\n");
        expect(linesA).toContain(`namespace=${runA.namespace}`);
        expect(linesA).not.toContain(`namespace=${runB.namespace}`);
        expect(linesB).toContain(`namespace=${runB.namespace}`);
        expect(linesB).not.toContain(`namespace=${runA.namespace}`);

        // 3. Logs are disjoint files; each carries only its own namespace's
        //    observations. The web fixture prints PORT last, so its presence
        //    proves the full env echo has been captured.
        const pathsA = runA.paths;
        const pathsB = runB.paths;
        expect(pathsA.serverLogFile).not.toBe(pathsB.serverLogFile);
        expect(pathsA.webLogFile).not.toBe(pathsB.webLogFile);
        const serverLogA = await pollFileIncluding(pathsA.serverLogFile, "SERVER_NS=conc-a");
        const serverLogB = await pollFileIncluding(pathsB.serverLogFile, "SERVER_NS=conc-b");
        const webLogA = await pollFileIncluding(pathsA.webLogFile, `PORT=${webPortA}`);
        const webLogB = await pollFileIncluding(pathsB.webLogFile, `PORT=${webPortB}`);
        expect(existsSync(pathsA.serverLogFile)).toBe(true);
        expect(existsSync(pathsB.serverLogFile)).toBe(true);
        expect(existsSync(pathsA.webLogFile)).toBe(true);
        expect(existsSync(pathsB.webLogFile)).toBe(true);
        expect(serverLogA).toContain("SERVER_NS=conc-a");
        expect(serverLogA).not.toContain("conc-b");
        expect(serverLogB).toContain("SERVER_NS=conc-b");
        expect(serverLogB).not.toContain("conc-a");
        expect(echoedValue(webLogA, "WEB_NS")).toBe("conc-a");
        expect(echoedValue(webLogB, "WEB_NS")).toBe("conc-b");
        expect(webLogA).not.toContain("conc-b");
        expect(webLogB).not.toContain("conc-a");

        // 4. Build dirs are disjoint, and the sidecar child saw exactly its
        //    own namespaced distDir (spec 5.5) and its own recorded port.
        const distDirA = path.join(pathsA.buildDir, "web-dist");
        const distDirB = path.join(pathsB.buildDir, "web-dist");
        expect(existsSync(pathsA.buildDir)).toBe(true);
        expect(existsSync(pathsB.buildDir)).toBe(true);
        expect(pathsA.buildDir).not.toBe(pathsB.buildDir);
        expect(echoedValue(webLogA, "DISTDIR")).toBe(distDirA);
        expect(echoedValue(webLogB, "DISTDIR")).toBe(distDirB);
        expect(webLogA).not.toContain(distDirB);
        expect(webLogB).not.toContain(distDirA);
        expect(echoedValue(webLogA, "PORT")).toBe(webPortA);
        expect(echoedValue(webLogB, "PORT")).toBe(webPortB);

        // 5. Independent teardown (spec 5.14): SIGINT stops A only.
        const sigintA = await pollSignalHandler(runA.handlers);
        const sigintB = await pollSignalHandler(runB.handlers);
        sigintA();
        await expect(runA.promise).resolves.toBe(0);
        for (const file of ownedRecordFiles(pathsA)) {
          expect(existsSync(file)).toBe(false);
        }
        await expectRefused(`http://127.0.0.1:${webPortA}/`);
        await expectRefused(`http://127.0.0.1:${serverPortA}/healthz`);

        // B is untouched: still serving, its records intact.
        const pageBAfterA = await fetch(`http://127.0.0.1:${webPortB}/`);
        expect(pageBAfterA.status).toBe(200);
        expect(await pageBAfterA.text()).toContain("WEB_NS=conc-b");
        for (const file of ownedRecordFiles(pathsB)) {
          expect(existsSync(file)).toBe(true);
        }
        expect(readFileSync(pathsB.webPortFile, "utf8").trim()).toBe(webPortB);
        expect(existsSync(pathsB.buildDir)).toBe(true);

        // B stops only when its own run is asked to stop.
        sigintB();
        await expect(runB.promise).resolves.toBe(0);
        for (const file of ownedRecordFiles(pathsB)) {
          expect(existsSync(file)).toBe(false);
        }
        await expectRefused(`http://127.0.0.1:${webPortB}/`);
      } finally {
        // Idempotent for runs the body already stopped; also covers failures
        // mid-test. Signal delivery is injected, never a real process signal.
        runA.handlers.get("SIGINT")?.();
        runB.handlers.get("SIGINT")?.();
        await Promise.allSettled([runA.promise, runB.promise]);
        await removeTempRoots(tempRoots);
      }
    },
    240_000
  );
});
