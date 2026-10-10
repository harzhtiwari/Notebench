#!/usr/bin/env bash
set -euo pipefail

# Notebench Restore Script (WAL-Safe Restore)
BACKUP_PATH="${1:-}"

if [ -z "${BACKUP_PATH}" ] || [ ! -d "${BACKUP_PATH}" ]; then
  echo "❌ Error: Please provide a valid backup directory path."
  echo "Usage: ./scripts/restore.sh <path-to-backup-dir>"
  exit 1
fi

echo "🔄 Restoring Notebench from ${BACKUP_PATH}..."

mkdir -p .notebook/state .notebook/uploads .notebook/artifacts .notebook/vault

rm -f .notebook/state/app.sqlite-wal .notebook/state/app.sqlite-shm

if [ -f "${BACKUP_PATH}/state/app.sqlite" ]; then
  echo "  - Restoring SQLite database..."
  cp "${BACKUP_PATH}/state/app.sqlite" .notebook/state/app.sqlite
  if [ -f "${BACKUP_PATH}/state/app.sqlite-wal" ]; then
    cp "${BACKUP_PATH}/state/app.sqlite-wal" .notebook/state/app.sqlite-wal
  fi
  if [ -f "${BACKUP_PATH}/state/app.sqlite-shm" ]; then
    cp "${BACKUP_PATH}/state/app.sqlite-shm" .notebook/state/app.sqlite-shm
  fi
fi

if [ -f "${BACKUP_PATH}/storage.tar.gz" ]; then
  echo "  - Restoring storage assets..."
  tar -xzf "${BACKUP_PATH}/storage.tar.gz" -C .notebook/
fi

echo "✅ Restore completed successfully."
