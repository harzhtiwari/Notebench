#!/usr/bin/env bash
set -euo pipefail

# Notebench Backup Script (WAL-Safe Hot Backup)
BACKUP_DIR="${1:-.tmp/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET="${BACKUP_DIR}/notebench_backup_${TIMESTAMP}"

mkdir -p "${TARGET}"

echo "📦 Creating Notebench backup at ${TARGET}..."

# 1. Hot SQLite Backup (WAL-Safe)
if [ -f ".notebook/state/app.sqlite" ]; then
  echo "  - Backing up SQLite database..."
  mkdir -p "${TARGET}/state"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 .notebook/state/app.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
    sqlite3 .notebook/state/app.sqlite ".backup '${TARGET}/state/app.sqlite'"
  else
    cp .notebook/state/app.sqlite "${TARGET}/state/app.sqlite"
    if [ -f ".notebook/state/app.sqlite-wal" ]; then
      cp .notebook/state/app.sqlite-wal "${TARGET}/state/app.sqlite-wal"
    fi
    if [ -f ".notebook/state/app.sqlite-shm" ]; then
      cp .notebook/state/app.sqlite-shm "${TARGET}/state/app.sqlite-shm"
    fi
  fi
fi

# 2. Archive uploads, artifacts, state, and vault
STORAGE_TARGETS=()
for folder in uploads artifacts state vault; do
  if [ -d ".notebook/${folder}" ]; then
    STORAGE_TARGETS+=("${folder}")
  fi
done

if [ ${#STORAGE_TARGETS[@]} -gt 0 ]; then
  echo "  - Archiving storage assets: ${STORAGE_TARGETS[*]}..."
  tar -czf "${TARGET}/storage.tar.gz" -C .notebook "${STORAGE_TARGETS[@]}" 2>/dev/null || true
fi

echo "✅ Backup successfully created at ${TARGET}"
