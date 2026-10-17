import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultProbeHttp,
  defaultReadFile,
  defaultReadFileSync,
  defaultSleep,
} from "../src/defaults.js";
import { makeTempRoot, removeTempRoots } from "./temp-dir.js";

/**
 * Hygiene suite for the shared orchestrator defaults (src/defaults.ts).
 *
 * These values are injected-default seams: each probe/io/sleep default is
 * wired into deps as a fallback, so the module is exercised the way the
 * orchestrator uses it — real timers, real files, and a real HTTP server.
 */

const tempRoots: string[] = [];

afterEach(() => removeTempRoots(tempRoots), 120_000);

describe("shared orchestrator defaults", () => {
  it("defaultSleep resolves", async () => {
    await expect(defaultSleep(1)).resolves.toBeUndefined();
  });

  it("defaultReadFile and defaultReadFileSync read UTF-8 files", async () => {
    const root = makeTempRoot(tempRoots, "notebench-defaults-");
    const file = join(root, "sample.txt");
    writeFileSync(file, "héllo wörld\nsecond line\n", "utf-8");
    await expect(defaultReadFile(file)).resolves.toBe("héllo wörld\nsecond line\n");
    expect(defaultReadFileSync(file)).toBe("héllo wörld\nsecond line\n");
  });

  it("defaultProbeHttp returns true only for 2xx statuses", async () => {
    const server = createServer((req, res) => {
      const status = Number(req.url?.slice(1) ?? "500");
      res.writeHead(status);
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected the fixture server to listen on a TCP port");
      }
      const base = `http://127.0.0.1:${String(address.port)}`;
      await expect(defaultProbeHttp(`${base}/200`)).resolves.toBe(true);
      await expect(defaultProbeHttp(`${base}/299`)).resolves.toBe(true);
      await expect(defaultProbeHttp(`${base}/300`)).resolves.toBe(false);
      await expect(defaultProbeHttp(`${base}/404`)).resolves.toBe(false);
      await expect(defaultProbeHttp(`${base}/500`)).resolves.toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
