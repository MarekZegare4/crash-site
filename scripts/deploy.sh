#!/usr/bin/env bash
# deploy.sh — pulls latest code, rebuilds containers, restarts services
#
# Usage:
#   ./scripts/deploy.sh           # deploy latest from current branch
#   ./scripts/deploy.sh --no-pull # skip git pull (redeploy current code)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

NO_PULL=false
for arg in "$@"; do
  [[ "$arg" == "--no-pull" ]] && NO_PULL=true
done

cd "$ROOT_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting deploy"

# Backup before deploy
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Creating pre-deploy backup..."
"$SCRIPT_DIR/backup.sh"

if [ "$NO_PULL" = false ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling latest code..."
  git pull --ff-only
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building containers..."
docker compose build --no-cache

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting services..."
docker compose up -d --remove-orphans

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting for backend health check..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend is up."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: backend did not start within 20 seconds."
    echo "  Check logs: docker compose logs backend"
    exit 1
  fi
  sleep 1
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy complete."
