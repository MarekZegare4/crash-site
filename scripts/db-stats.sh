#!/usr/bin/env bash
# db-stats.sh — prints a quick summary of the database and disk usage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DB_FILE="${DATABASE_PATH:-$ROOT_DIR/data/app.db}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT_DIR/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

if [ ! -f "$DB_FILE" ]; then
  echo "Error: database not found at $DB_FILE"
  exit 1
fi

echo "=== Crash Site — $(date '+%Y-%m-%d %H:%M:%S') ==="
echo ""

echo "--- Listings ---"
sqlite3 "$DB_FILE" "
  SELECT
    'total:    ' || COUNT(*)                                         FROM listings;
"
sqlite3 "$DB_FILE" "SELECT
    'active:   ' || COUNT(*) FROM listings WHERE status = 'active' AND (expiresAt IS NULL OR expiresAt > datetime('now'));
"
sqlite3 "$DB_FILE" "SELECT
    'resolved: ' || COUNT(*) FROM listings WHERE status = 'resolved';
"
sqlite3 "$DB_FILE" "SELECT
    'expired:  ' || COUNT(*) FROM listings WHERE status = 'active' AND expiresAt IS NOT NULL AND expiresAt <= datetime('now');
"
sqlite3 "$DB_FILE" "SELECT
    'private:  ' || COUNT(*) FROM listings WHERE isPublic = 0;
"
sqlite3 "$DB_FILE" "SELECT
    'lost:     ' || COUNT(*) FROM listings WHERE type = 'lost';
"
sqlite3 "$DB_FILE" "SELECT
    'found:    ' || COUNT(*) FROM listings WHERE type = 'found';
"

echo ""
echo "--- Users ---"
sqlite3 "$DB_FILE" "SELECT 'total:    ' || COUNT(*) FROM users;"
sqlite3 "$DB_FILE" "SELECT 'admins:   ' || COUNT(*) FROM users WHERE role = 'admin';"
sqlite3 "$DB_FILE" "SELECT 'banned:   ' || COUNT(*) FROM users WHERE banned = 1;"
sqlite3 "$DB_FILE" "SELECT 'new 7d:   ' || COUNT(*) FROM users WHERE createdAt >= datetime('now', '-7 days');"

echo ""
echo "--- Reports ---"
sqlite3 "$DB_FILE" "SELECT 'pending:  ' || COUNT(*) FROM reports WHERE status = 'pending';" 2>/dev/null || echo "pending:  0"
sqlite3 "$DB_FILE" "SELECT 'total:    ' || COUNT(*) FROM reports;" 2>/dev/null || echo "total:    0"

echo ""
echo "--- Disk ---"
DB_SIZE="$(du -sh "$DB_FILE" 2>/dev/null | cut -f1)"
UPLOADS_SIZE="$(du -sh "$UPLOADS_DIR" 2>/dev/null | cut -f1 || echo "n/a")"
UPLOADS_COUNT="$(find "$UPLOADS_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
BACKUP_SIZE="$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "n/a")"
BACKUP_COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name '*.tar.gz' 2>/dev/null | wc -l | tr -d ' ')"

echo "db:       $DB_SIZE  ($DB_FILE)"
echo "uploads:  $UPLOADS_SIZE  ($UPLOADS_COUNT files)"
echo "backups:  $BACKUP_SIZE  ($BACKUP_COUNT files)"
