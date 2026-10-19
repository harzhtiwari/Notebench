/**
@notebench/tools-dev entry.

The dev-runtime track lives here in full: orchestrator and web sidecar
lifecycle (tickets 01-05+) with tests mirroring `src/` under `tests/`.
*/

export {
  ensureSidecarTsconfig,
  isIsolatedCompilerPath,
  resolveWebCompilerEnv,
  SIDECAR_TSCONFIG_FILENAME,
  WEB_DEV_BUNDLER_ENV,
  WEB_DEV_BUNDLER_ENV_ALIAS,
  WEB_DIST_DIR_ENV,
  WEB_DIST_DIR_ENV_ALIAS,
  WEB_TSCONFIG_ENV,
  WEB_TSCONFIG_ENV_ALIAS,
} from "./config-duality.js";
export type { WebCompilerEnv, WebDevBundler } from "./config-duality.js";
