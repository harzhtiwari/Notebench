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

const distDir = sidecarDistDir();
const sidecarTsconfig = sidecarTsconfigPath();

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
