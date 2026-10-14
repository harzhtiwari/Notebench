import { describe, expect, it, afterEach } from "vitest";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readdirSync } from "node:fs";
import { join } from "node:path";
// Ticket 05 is blocked by 04's running sidecar: prove the edit-to-update
// path against the sidecar entry with an injected fake compiler (no real
// Next boot, no production build in the loop).
import { startSidecar } from "../src/sidecar/entry.js";

/**
 * Ticket 05 slice 5 — edit-to-update smoke (spec 5.10, story 2 + 9).
 *
 * Seam under test:
 * - (C) sidecar HTTP boundary observed via real HTTP: pages come from the
 *   compiler handler, APIs reach the live backend. A component edit is
 *   simulated by changing what the compiler handler serves; the backend
 *   response must stay identical and no composer state may appear.
 *
 * Vocabulary: orchestrator, server, web sidecar, namespace (spec section 1).
 */
describe("ticket 05: component edit updates the UI with backend untouched", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop() as Server;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function tmpTopLevel(): string[] {
    try {
      return readdirSync(join(process.cwd(), ".tmp")).sort();
    } catch {
      return [];
    }
  }

  it("serves edited page content while API responses stay identical", async () => {
    const backend = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ marker: "backend-v1", url: req.url }));
    });
    servers.push(backend);
    const originPort = await new Promise<number>((resolve, reject) => {
      backend.once("error", reject);
      backend.listen(0, "127.0.0.1", () => {
        const address = backend.address();
        if (address === null || typeof address === "string") {
          reject(new Error("smoke backend did not bind a TCP port"));
          return;
        }
        resolve(address.port);
      });
    });

    let pageContent = "smoke-v1";
    const fakeApp = {
      prepare: () => Promise.resolve(),
      getRequestHandler: () => (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<html><body>${pageContent}</body></html>`);
      },
      getUpgradeHandler: () => () => undefined,
      close: () => Promise.resolve(),
    };

    const beforeTmp = tmpTopLevel();
    const handle = await startSidecar({
      webDir: join(process.cwd(), "apps", "web"),
      host: "127.0.0.1",
      port: 0,
      env: {
        NOTEBENCH_SERVER_ORIGIN: `http://127.0.0.1:${originPort}`,
        NOTEBENCH_WEB_DIST_DIR: join(process.cwd(), ".tmp", "build", "smoke-ns", "web-dist"),
      },
      createApp: () => Promise.resolve(fakeApp),
    });
    try {
      const firstPage = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(await firstPage.text()).toContain("smoke-v1");
      const firstApi = await fetch(`http://127.0.0.1:${handle.port}/api/smoke`);
      const firstBody = await firstApi.text();
      expect(JSON.parse(firstBody)).toMatchObject({ marker: "backend-v1" });

      // Simulate a component edit: only the compiler handler changes.
      pageContent = "smoke-v2";
      const secondPage = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(await secondPage.text()).toContain("smoke-v2");
      const secondApi = await fetch(`http://127.0.0.1:${handle.port}/api/smoke`);
      expect(await secondApi.text()).toBe(firstBody);
    } finally {
      await handle.close();
    }
    // Composer owns ports/pids/run records: this smoke creates none.
    expect(tmpTopLevel()).toEqual(beforeTmp);
  }, 15_000);
});
