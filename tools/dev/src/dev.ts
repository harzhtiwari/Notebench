import { runDevCommand } from "./composer.js";

/**
`pnpm dev` entry (ticket 04): foreground orchestrator carrying the full
run — backend from source gated on health, then the web sidecar from
source gated on a real route, both under reverse-order supervision.
*/
const exitCode = await runDevCommand({
  root: process.cwd(),
  argv: process.argv.slice(2),
  env: process.env,
});
process.exitCode = exitCode;
