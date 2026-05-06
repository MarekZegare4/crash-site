#!/usr/bin/env bash
# restore.sh — restores a backup created by backup.sh
#
# Usage:
#   ./scripts/restore.sh backups/crash-site-20260501-020000.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT_DIR/uploads}"
DB_FILE="${DATABASE_PATH:-$DATA_DIR/app.db}"

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restoring from $BACKUP_FILE"
echo "  Target DB:      $DB_FILE"
echo "  Target uploads: $UPLOADS_DIR"
echo ""
read -r -p "Continue? This will overwrite current data. [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

tar -xzf "$BACKUP_FILE" -C "$TMP_DIR"

# The db file inside the archive has a tmp name — find it
DB_IN_ARCHIVE="$(find "$TMP_DIR" -maxdepth 1 -name 'tmp.*' -o -name '*.db' | head -1)"
if [ -z "$DB_IN_ARCHIVE" ]; then
  echo "Error: could not find database file inside archive."
  exit 1
fi

mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

# Back up current db before overwriting
if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "${DB_FILE}.pre-restore"
  echo "  Previous DB saved as ${DB_FILE}.pre-restore"
fi

cp "$DB_IN_ARCHIVE" "$DB_FILE"

if [ -d "$TMP_DIR/uploads" ]; then
  rsync -a --delete "$TMP_DIR/uploads/" "$UPLOADS_DIR/"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore complete."
echo "  Restart the backend to pick up the restored database."
