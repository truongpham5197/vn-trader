#!/usr/bin/env bash
# Dump Neon prod → restore vào database `vntrader` trong infra-postgres.
# Idempotent: pg_restore --clean xóa object cũ trước khi tạo lại.
# Chạy TRÊN VPS:  ./deploy/vps/migrate-db.sh
# Cần NEON_URL trong deploy/vps/.env (hoặc env) — connection string Neon cũ.
set -euo pipefail
cd "$(dirname "$0")"

set -a; source ./.env; set +a
: "${NEON_URL:?set NEON_URL=<neon connection string> in .env}"
: "${DATABASE_URL:?set DATABASE_URL in .env}"

DUMP=/opt/backups/vntrader-neon-$(date +%Y%m%d-%H%M%S).dump
mkdir -p /opt/backups

docker run --rm --network infra_internal \
  -v /opt/backups:/b postgres:18-alpine \
  pg_dump "$NEON_URL" -Fc -f "/b/$(basename "$DUMP")"

# Restore: --clean để chạy lại được; --no-owner vì owner Neon != vntrader.
# pg_restore exit non-zero trên warning vô hại (PG version chênh) — bỏ qua
# exit code, verify bằng row counts ngay sau.
docker run --rm --network infra_internal \
  -v /opt/backups:/b postgres:18-alpine \
  pg_restore --clean --if-exists --no-owner --no-privileges \
    -d "$DATABASE_URL" "/b/$(basename "$DUMP")" \
  || echo "pg_restore exit $? — kiểm tra counts bên dưới"

# Fix ownership về vntrader (objects restore ra thuộc role chạy pg_restore).
docker exec infra-postgres-1 psql -U postgres -d vntrader -v ON_ERROR_STOP=1 <<'SQL'
REASSIGN OWNED BY CURRENT_USER TO vntrader;
SQL

echo "== counts =="
docker exec infra-postgres-1 psql -U postgres -d vntrader -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
