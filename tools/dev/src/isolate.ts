import path from "node:path";
import type { RunPaths } from "./paths.js";

/**
Per-namespace generated paths for the dev orchestrator: compiler output,
generated sidecar config, and caches. Everything lives under the run's
namespaced build directory inside the disposable root, so two namespaces
can never share generated state.
*/

export interface GeneratedPaths {
  buildDir: string;
  distDir: string;
  tsconfigPath: string;
  cacheDir: string;
}

/**
Resolve the generated compiler/config paths for one run. Derived purely
from the run's namespaced build directory, hence disjoint across
namespaces by construction.
*/
export function resolveGeneratedPathsForRun(paths: RunPaths): GeneratedPaths {
  return {
    buildDir: paths.buildDir,
    distDir: path.join(paths.buildDir, "web-dist"),
    tsconfigPath: path.join(paths.buildDir, "tsconfig.dev.json"),
    cacheDir: path.join(paths.buildDir, "cache"),
  };
}
