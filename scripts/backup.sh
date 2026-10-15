#!/usr/bin/env bash
set -euo pipefail

# Notebench host backup (spec 8.9, PRD L8).
# Hot SQLite snapshot via the Online Backup API (better-sqlite3 db.backup()
# through packages/infra-db/src/backup-cli.ts -- raw file copy is banned by
# spec 8.1), then a compressed archive of .notebook/ plus a SHA-256 manifest.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${NOTEBENCH_DB_PATH:-$ROOT/.notebook/db/app.sqlite}"
BACKUP_DIR="${1:-$ROOT/.notebook/db/backups}"
mkdir -p "$BACKUP_DIR"
# Absolutize: later steps `cd` into this dir, so relative paths would break.
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
TARBALL="$BACKUP_DIR/notebench-backup-$TIMESTAMP.tar.gz"

run_tsx() {
  if [ -n "${NOTEBENCH_TSX:-}" ]; then
    # Intentional word splitting: NOTEBENCH_TSX may carry extra flags.
    # shellcheck disable=SC2086
    ${NOTEBENCH_TSX} "$@"
  else
    pnpm --dir "$ROOT" exec tsx "$@"
  fi
}

echo "Creating Notebench backup at $TARBALL ..."

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if [ -f "$DB_PATH" ]; then
  echo "  - Online SQLite backup (WAL-safe, db.backup API) ..."
  mkdir -p "$STAGE/db"
  run_tsx "$ROOT/packages/infra-db/src/backup-cli.ts" backup "$DB_PATH" "$STAGE/db/app.sqlite"
  echo "  - Applying snapshot retention (last 10 or 14 days, never newest) ..."
  run_tsx "$ROOT/packages/infra-db/src/backup-cli.ts" prune "$(dirname "$DB_PATH")/backups"
else
  echo "  - No database at $DB_PATH; archiving file state only."
fi

for folder in uploads artifacts vault; do
  if [ -d "$ROOT/.notebook/$folder" ]; then
    echo "  - Archiving .notebook/$folder ..."
    mkdir -p "$STAGE/$folder"
    cp -r "$ROOT/.notebook/$folder/." "$STAGE/$folder/"
  fi
done

tar -czf "$TARBALL" -C "$STAGE" .
echo "  - Writing SHA-256 manifest ..."
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$TARBALL")" > "$TARBALL.sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$TARBALL")" > "$TARBALL.sha256")
else
  echo "  - WARNING: no sha256sum/shasum available; manifest skipped."
fi

echo "  - Rotating host archives (last 10 or 14 days, never newest) ..."
# Union retention (spec 8.7, mirrors selectBackupsToPrune in
# packages/infra-db/src/backup.ts): the newest archive is never pruned; keep
# the newest 10 plus every archive modified within the last 14 days.
newest_archive="$(ls -t "$BACKUP_DIR"/notebench-backup-*.tar.gz 2>/dev/null | head -n 1 || true)"
if [ -n "$newest_archive" ]; then
  rank=0
  # Filenames are machine-generated timestamps (no spaces); word splitting here is safe.
  # shellcheck disable=SC2045
  for candidate in $(ls -t "$BACKUP_DIR"/notebench-backup-*.tar.gz 2>/dev/null); do
    rank=$((rank + 1))
    if [ "$rank" -le 10 ]; then continue; fi
    if [ "$candidate" = "$newest_archive" ]; then continue; fi
    if [ -z "$(find "$candidate" -mtime +14 -print 2>/dev/null)" ]; then continue; fi
    echo "    pruning $candidate"
    rm -f "$candidate" "$candidate.sha256"
  done
fi

trap - EXIT
rm -rf "$STAGE"

echo "Backup complete: $TARBALL"
