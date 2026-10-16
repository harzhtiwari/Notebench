import type { NextConfig } from "next";
import { dirname, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Explicit sidecar branch (dev-runtime track, spec 5.10): when the
 * orchestrator runs the development sidecar it sets NOTEBENCH_WEB_DIST_DIR
 * (alias NB_WEB_DIST_DIR) to the run's namespaced compiler output directory
 * and NOTEBENCH_WEB_TSCONFIG_PATH (alias NB_WEB_TSCONFIG_PATH) to the run's
 * generated tsconfig. The compiler then writes there instead of the
 * production export directory, and the static-export settings stay out of
 * the dev path. Without the env markers this file is exactly the production
 * export config (ticket 05 owns the byte-identity proof).
 */
function sidecarDistDir(): string | undefined {
  const value =
    process.env["NOTEBENCH_WEB_DIST_DIR"] ?? process.env["NB_WEB_DIST_DIR"];
  if (value === undefined || value === "") return undefined;
  return value;
}

function sidecarTsconfigPath(): string | undefined {
  const value =
    process.env["NOTEBENCH_WEB_TSCONFIG_PATH"] ??
    process.env["NB_WEB_TSCONFIG_PATH"];
  if (value === undefined || value === "") return undefined;
  return value;
}

/**
 * CLI cutover: the sidecar runs the real `next dev` CLI, so the API split
 * (previously the in-process proxy's PROXIED_PREFIXES) is expressed as
 * rewrites to the run's live backend origin. Only in the sidecar branch;
 * the production export branch stays rewrite-free.
 */
function sidecarServerOrigin(): string | undefined {
  const value =
    process.env["NOTEBENCH_SERVER_ORIGIN"] ?? process.env["NB_SERVER_ORIGIN"];
  if (value === undefined || value === "") return undefined;
  return value;
}

/** Loopback-only origins may receive the API split (mirrors the old proxy posture). */
function assertLoopbackOrigin(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`Invalid sidecar server origin "${origin}": must be a URL.`);
  }
  if (url.protocol !== "http:") {
    throw new Error(
      `Invalid sidecar server origin "${origin}": only http loopback origins are rewritten.`
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") {
    throw new Error(
      `Refusing non-loopback sidecar server origin "${origin}": rewrites target the local server only.`
    );
  }
}

/** Boundary-aware split: exact prefix plus subpaths, never near-misses (`/apix`). */
const SIDECAR_API_PREFIXES: readonly string[] = ["/api", "/artifacts", "/frames"];

function sidecarRewrites(origin: string): Array<{ source: string; destination: string }> {
  const rules: Array<{ source: string; destination: string }> = [];
  for (const prefix of SIDECAR_API_PREFIXES) {
    rules.push({ source: prefix, destination: `${origin}${prefix}` });
    rules.push({ source: `${prefix}/:path*`, destination: `${origin}${prefix}/:path*` });
  }
  return rules;
}

const distDir = sidecarDistDir();
const sidecarTsconfig = sidecarTsconfigPath();
const serverOrigin = sidecarServerOrigin();
if (serverOrigin !== undefined) assertLoopbackOrigin(serverOrigin);

// Production export branch (default) vs development sidecar branch. The
// production object is untouched by the sidecar markers.
//
// The dev bundler joins distDir and the tsconfig path onto the app dir
// (path.join, which mangles absolute segments on Windows), so the branch
// hands Next paths relative to this file; the env contract itself stays
// absolute.
const branch: NextConfig =
  distDir === undefined
    ? { output: "export", distDir: "out" }
    : {
        distDir: isAbsolute(distDir)
          ? relative(dirname(fileURLToPath(import.meta.url)), distDir)
          : distDir,
        ...(sidecarTsconfig === undefined
          ? {}
          : {
              typescript: {
                tsconfigPath: isAbsolute(sidecarTsconfig)
                  ? relative(
                      dirname(fileURLToPath(import.meta.url)),
                      sidecarTsconfig
                    )
                  : sidecarTsconfig,
              },
            }),
      };

const nextConfig: NextConfig = {
  ...branch,
  ...(serverOrigin === undefined
    ? {}
    : {
        rewrites: () => Promise.resolve(sidecarRewrites(serverOrigin)),
      }),
  images: {
    unoptimized: true,
  },
  // @notebook/ui ships compiled dist output — do NOT list here (see transpilePackages docs).
  transpilePackages: [],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
