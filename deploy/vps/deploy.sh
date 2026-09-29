#!/usr/bin/env bash
# Deploy vn-trader trên VPS. Chạy TRÊN VPS, trong checkout /opt/vn-trader.
#   ./deploy/vps/deploy.sh [branch]
# Mặc định = branch đang checkout (thường main = production).
set -euo pipefail

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  BRANCH="$(git branch --show-current 2>/dev/null || true)"
  BRANCH="${BRANCH:-main}"
fi
cd "$(dirname "$0")/../.."

if [ -d .git ]; then
  git fetch origin "$BRANCH" || {
    echo "origin/$BRANCH không có — kiểm tra tên nhánh"; exit 1;
  }
  git reset --hard "origin/$BRANCH"
fi

docker compose -f deploy/vps/docker-compose.yml \
  --env-file deploy/vps/.env build
docker compose -f deploy/vps/docker-compose.yml \
  --env-file deploy/vps/.env up -d

docker image prune -f
docker ps --filter name=vn-trader
