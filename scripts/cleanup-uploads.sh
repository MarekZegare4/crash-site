#!/usr/bin/env bash
# cleanup-uploads.sh — removes uploaded files no longer referenced in the database
#
# Usage:
#   ./scripts/cleanup-uploads.sh           # dry run — only lists orphaned files
#   ./scripts/cleanup-uploads.sh --delete  # actually deletes them

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

UPLOADS_DIR="${UPLOADS_DIR:-$ROOT_DIR/uploads}"
DB_FILE="${DATABASE_PATH:-$ROOT_DIR/data/app.db}"
DELETE=false

for arg in "$@"; do
  [[ "$arg" == "--delete" ]] && DELETE=true
done

if [ ! -f "$DB_FILE" ]; then
  echo "Error: database not found at $DB_FILE"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Scanning uploads vs database..."
echo "  DB:      $DB_FILE"
echo "  Uploads: $UPLOADS_DIR"
echo ""

# Collect all filenames referenced in the database
REFERENCED="$(mktemp)"
trap 'rm -f "$REFERENCED"' EXIT

sqlite3 "$DB_FILE" "
  SELECT imageUrl FROM listings WHERE imageUrl != '' AND imageUrl IS NOT NULL
  UNION
  SELECT value FROM listings, json_each(listings.extraImageUrls)
    WHERE extraImageUrls IS NOT NULL AND extraImageUrls != '[]'
" | sed 's|.*/||' | sort > "$REFERENCED"

TOTAL=0
ORPHANED=0
SIZE_FREED=0

while IFS= read -r -d '' FILE; do
  FILENAME="$(basename "$FILE")"
  TOTAL=$((TOTAL + 1))
  if ! grep -qxF "$FILENAME" "$REFERENCED"; then
    FILE_SIZE="$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null || echo 0)"
    ORPHANED=$((ORPHANED + 1))
    SIZE_FREED=$((SIZE_FREED + FILE_SIZE))
    if [ "$DELETE" = true ]; then
      rm "$FILE"
      echo "  deleted: $FILENAME"
    else
      echo "  orphaned: $FILENAME"
    fi
  fi
done < <(find "$UPLOADS_DIR" -maxdepth 1 -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) -print0)

SIZE_MB="$(echo "scale=2; $SIZE_FREED / 1048576" | bc)"

echo ""
echo "Total files:    $TOTAL"
echo "Orphaned files: $ORPHANED ($SIZE_MB MB)"

if [ "$ORPHANED" -gt 0 ] && [ "$DELETE" = false ]; then
  echo ""
  echo "Run with --delete to remove orphaned files."
fi
