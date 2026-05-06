#!/usr/bin/env bash
# backup.sh — creates a timestamped backup of the database and uploads
#
# Usage:
#   ./scripts/backup.sh                    # saves to ./backups/
#   BACKUP_DIR=/mnt/storage ./scripts/backup.sh
#
# To run automatically every night at 02:00, add to crontab (crontab -e):
#   0 2 * * * /opt/crash-site/scripts/backup.sh >> /var/log/crash-site-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT_DIR/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
DB_FILE="${DATABASE_PATH:-$DATA_DIR/app.db}"
KEEP_DAYS="${KEEP_DAYS:-30}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/crash-site-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup → $BACKUP_FILE"

# SQLite hot-backup (safe while the server is running)
TMP_DB="$(mktemp)"
trap 'rm -f "$TMP_DB"' EXIT
sqlite3 "$DB_FILE" ".backup $TMP_DB"

tar -czf "$BACKUP_FILE" \
  -C "$(dirname "$TMP_DB")" "$(basename "$TMP_DB")" \
  -C "$ROOT_DIR" uploads/

# Embed the real db filename inside the archive metadata via a symlink trick
# is not worth it — just document: the db file inside the archive is the tmp name.
# To restore: see docs/deployment.md

SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done — $BACKUP_FILE ($SIZE)"

# Remove backups older than KEEP_DAYS days
REMOVED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'crash-site-*.tar.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')"
if [ "$REMOVED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Removed $REMOVED backup(s) older than ${KEEP_DAYS} days"
fi
