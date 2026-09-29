# vn-trader trên VPS

Production self-host từ 2026-09-29 (thay Vercel + cron-job.org):

```
vn-trader.36.50.55.41.sslip.io ──► Caddy :443 (auto TLS)
                                    └─ reverse_proxy vn-trader:3000
container vn-trader (Next.js standalone, node server.js)
  └─ instrumentation → startJobs(): node-cron eod-sync/scan/watcher/
     positions-report/weekly chạy in-process (VERCEL unset)
Postgres `vntrader` trong infra-postgres-1 (network infra_internal)
Telegram: webhook → /api/telegram/webhook (TELEGRAM_POLLING=false)
```

## Deploy (trên VPS, trong /opt/vn-trader)

```bash
./deploy/vps/deploy.sh          # pull main + build image + up
./deploy/vps/deploy.sh <nhánh>  # deploy nhánh khác (vd test PR)
```

## Đổi env

Sửa `deploy/vps/.env` (chmod 600, không commit) → `docker compose
-f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d`
để recreate container. Không cần rebuild (env runtime).

## DB

Migrate Neon → infra-postgres (đã chạy 1 lần): `./deploy/vps/migrate-db.sh`
— idempotent, cần `NEON_URL` trong .env. Backup chung của VPS:
`/etc/cron.daily/pg-backup` → `/opt/backups/` (14 ngày).

## Telegram webhook

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url="https://vn-trader.36.50.55.41.sslip.io/api/telegram/webhook" \
  -d secret_token="$TELEGRAM_WEBHOOK_SECRET" \
  -d allowed_updates='["message","callback_query"]'
```

Đổi domain → sửa Caddyfile + setWebhook lại.

## Vercel — frontend phụ

`vn-trader.vercel.app` vẫn deploy từ `main` nhưng chỉ là frontend dự phòng:
env `DATABASE_URL` trỏ Postgres VPS (`36.50.55.41:5432?sslmode=require` —
pg_hba ép hostssl cho IP ngoài docker). Không còn cron trên Vercel
(`vercel.json` xóa) + cron-job.org đã disable — mọi job chỉ chạy
node-cron in-process trong container này. Neon đã migrate + bỏ hẳn.
