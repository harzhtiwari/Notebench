#!/usr/bin/env bash
set -euo pipefail

# Notebench host restore (spec 8.9, PRD L8).
# Verifies the SHA-256 manifest, deletes orphaned WAL/SHM files to prevent
# the replay trap (spec 8.3), extracts the archive, then asserts
# PRAGMA integrity_check on a fresh read-write handle.
#
# Usage: ./scripts/restore.sh <path-to-tarball-or-backup-dir>

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${NOTEBENCH_DB_PATH:-$ROOT/.notebook/db/app.sqlite}"
INPUT="${1:-}"

if [ -z "$INPUT" ]; then
  echo "Error: provide a backup tarball or a directory holding one."
  echo "Usage: ./scripts/restore.sh <path-to-backup-tarball-or-dir>"
  exit 1
fi

TARBALL=""
if [ -f "$INPUT" ]; then
  TARBALL="$INPUT"
elif [ -d "$INPUT" ]; then
  TARBALL="$(ls -r "$INPUT"/notebench-backup-*.tar.gz 2>/dev/null | head -n 1 || true)"
  if [ -z "$TARBALL" ]; then
    echo "Error: no notebench-backup-*.tar.gz found in $INPUT"
    exit 1
  fi
  echo "Selected newest archive: $TARBALL"
else
  echo "Error: $INPUT is neither a file nor a directory."
  exit 1
fi

# Absolutize: later steps `cd` elsewhere, so relative paths would break.
if command -v realpath >/dev/null 2>&1; then
  TARBALL="$(realpath "$TARBALL")"
else
  TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
fi

run_tsx() {
  if [ -n "${NOTEBENCH_TSX:-}" ]; then
    # Intentional word splitting: NOTEBENCH_TSX may carry extra flags.
    # shellcheck disable=SC2086
    ${NOTEBENCH_TSX} "$@"
  else
    pnpm --dir "$ROOT" exec tsx "$@"
  fi
}

echo "Restoring Notebench from $TARBALL ..."

if [ -f "$TARBALL.sha256" ]; then
  echo "  - Verifying SHA-256 manifest ..."
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$TARBALL")" && shasum -a 256 -c "$(basename "$TARBALL").sha256")
  else
    echo "  - WARNING: no sha256sum/shasum available; skipping verification."
  fi
else
  echo "  - WARNING: no .sha256 sidecar for $TARBALL; continuing unverified."
fi

mkdir -p "$ROOT/.notebook/uploads" "$ROOT/.notebook/artifacts" "$ROOT/.notebook/vault" "$(dirname "$DB_PATH")"

echo "  - Deleting orphaned WAL/SHM files (replay-trap guard, spec 8.3) ..."
run_tsx "$ROOT/packages/infra-db/src/backup-cli.ts" unlink-wal-shm "$DB_PATH"

echo "  - Extracting archive to staging ..."
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$TARBALL" -C "$STAGE"

if [ -f "$STAGE/db/app.sqlite" ]; then
  echo "  - Placing database snapshot at $DB_PATH ..."
  cp "$STAGE/db/app.sqlite" "$DB_PATH"
fi
for folder in uploads artifacts vault; do
  if [ -d "$STAGE/$folder" ]; then
    echo "  - Restoring .notebook/$folder ..."
    mkdir -p "$ROOT/.notebook/$folder"
    cp -r "$STAGE/$folder/." "$ROOT/.notebook/$folder/"
  fi
done
trap - EXIT
rm -rf "$STAGE"

if [ -f "$DB_PATH" ]; then
  echo "  - Running PRAGMA integrity_check ..."
  run_tsx "$ROOT/packages/infra-db/src/backup-cli.ts" verify "$DB_PATH"
fi

echo "Restore complete."
