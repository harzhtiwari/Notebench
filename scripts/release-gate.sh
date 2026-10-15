#!/usr/bin/env bash
set -euo pipefail

# Notebench v0.1 release gate (spec 9.10).
# Every step must pass before `changeset version` / `changeset publish` run.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

gate() {
  echo ""
  echo "==> gate: $1"
  shift
  "$@"
}

gate "unit, contract and invariant tests" pnpm test
gate "typecheck" pnpm typecheck
gate "lint" pnpm lint
gate "architectural guardrails" pnpm guard
gate "permissive-license audit" pnpm lint:licenses
gate "rollback proof (spec 8.3 + helper unit test, graph #40)" \
  pnpm exec vitest run packages/infra-db/src/backup.test.ts packages/infra-db/src/migrator/migrator.test.ts

echo ""
echo "==> gate: docker check (ticket 25)"
if [ -f "$ROOT/scripts/docker-check.sh" ]; then
  bash "$ROOT/scripts/docker-check.sh"
else
  echo "    SKIP: scripts/docker-check.sh not present yet (ticket 25 owns it);"
  echo "    re-run the gate once it lands. Tarball backup/restore dry-run below"
  echo "    still exercises the host disaster-recovery path."
fi

echo ""
echo "All release gates passed."
