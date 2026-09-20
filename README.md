# VN Trading Assistant

Web app cá nhân hỗ trợ trading cổ phiếu cơ sở VN: EOD scanner → Telegram alert
(entry/stop/size) → semi-auto order qua TCBS → journal. Spec:
`docs/superpowers/specs/2026-09-20-vn-trading-assistant-design.md`.

## Stack

Next.js 16 + TypeScript + Prisma/SQLite + grammY + node-cron. Package manager:
**pnpm** (npm 9.6 của máy crash khi resolve peer deps vitest — dùng
`npm exec --yes pnpm@latest -- <cmd>` nếu chưa cài pnpm global).

## Nguồn dữ liệu (public, không cần key)

- Danh sách mã niêm yết: VNDirect `api-finfo.vndirect.com.vn/v4/stocks`
  (query theo `floor:`, size=1000 — pagination bị drift nếu lật nhiều page)
- OHLCV ngày + chỉ số: DNSE `services.entrade.com.vn/chart-api/v2/ohlcs`

## Chạy

```bash
npm exec --yes pnpm@latest -- install
cp .env.example .env   # điền TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (tạo bot qua @BotFather)
npm run db:push        # tạo SQLite schema
npm run dev            # http://localhost:3000 — cron + bot polling tự chạy
```

## Cron jobs (Asia/Ho_Chi_Minh, T2–T6)

- `15:20` — EOD sync bars (lần đầu chạy tay với lookback dài, xem dưới)
- `15:40` — scan chiến lược → Signal → Telegram

Trigger tay:

```bash
# sync toàn bộ symbol + 150 ngày bars (lần đầu — mất ~5-10 phút)
curl -X POST localhost:3000/api/cron/eod-sync -d '{"withSymbols":true,"lookbackDays":150}'

# chỉ vài mã
curl -X POST localhost:3000/api/cron/eod-sync -d '{"onlyTickers":["FPT","HPG"],"lookbackDays":120}'

# scan thủ công (không gửi Telegram)
curl -X POST localhost:3000/api/cron/scan -d '{"notify":false}'

# test Telegram
curl -X POST localhost:3000/api/telegram/test
```

## Telegram bot commands

`/status` `/signals` `/positions` `/pause` `/resume` `/kill`

## Test

```bash
npm run test   # vitest — strategy + sizing
```
