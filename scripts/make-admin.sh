#!/usr/bin/env bash
# make-admin.sh — sets ADMIN_SOCIAL_IDS in .env after first login
#
# Usage:
#   ./scripts/make-admin.sh           # lists users, then prompts which to make admin
#   ./scripts/make-admin.sh --list    # only list users, no changes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DB_FILE="${DATABASE_PATH:-$ROOT_DIR/data/app.db}"
ENV_FILE="$ROOT_DIR/.env"
LIST_ONLY=false

for arg in "$@"; do
  [[ "$arg" == "--list" ]] && LIST_ONLY=true
done

if [ ! -f "$DB_FILE" ]; then
  echo "Error: database not found at $DB_FILE"
  echo "  Has the server been started and has anyone logged in yet?"
  exit 1
fi

echo "=== Users in database ==="
echo ""

# Show users with their provider:providerUserId key (what ADMIN_SOCIAL_IDS expects)
sqlite3 -column -header "$DB_FILE" "
  SELECT
    id,
    provider || ':' || providerUserId  AS social_key,
    displayName,
    role,
    datetime(createdAt, 'localtime')   AS joined
  FROM users
  ORDER BY datetime(createdAt);
"

echo ""

[ "$LIST_ONLY" = true ] && exit 0

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found at $ENV_FILE"
  exit 1
fi

echo "Enter the social_key(s) from the table above for admin access."
echo "Multiple values: comma-separated, e.g.  github:12345,google:67890"
echo ""
read -r -p "Admin social keys: " NEW_IDS

if [ -z "$NEW_IDS" ]; then
  echo "Nothing entered — no changes made."
  exit 0
fi

# Update or insert ADMIN_SOCIAL_IDS in .env
if grep -q "^ADMIN_SOCIAL_IDS=" "$ENV_FILE"; then
  # Replace existing line (works on macOS and Linux)
  sed -i.bak "s|^ADMIN_SOCIAL_IDS=.*|ADMIN_SOCIAL_IDS=${NEW_IDS}|" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  echo "ADMIN_SOCIAL_IDS=${NEW_IDS}" >> "$ENV_FILE"
fi

echo ""
echo "Updated .env: ADMIN_SOCIAL_IDS=${NEW_IDS}"
echo ""
echo "Restart the backend for the change to take effect:"
echo "  docker compose up -d backend"
echo ""
echo "  (use 'up -d', not 'restart' — only 'up' re-reads .env)"
