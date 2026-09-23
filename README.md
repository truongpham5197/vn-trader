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

## Cron jobs (Asia/Ho_Chi_Minh)

- `15:20 T2–T6` — EOD sync bars (lần đầu chạy tay với lookback dài, xem dưới)
- `15:40 T2–T6` — scan chiến lược → Signal → Telegram
- `* 9:00–14:59 T2–T6` — stop-loss watcher + sync lệnh pending (TCBS live)
- `20:00 CN` — báo cáo tuần qua Telegram (P&L, win rate, adherence)

## Trang

- `/` — dashboard + tín hiệu hôm nay
- `/signals` — tất cả tín hiệu (`?date=YYYY-MM-DD`)
- `/backtest` — chạy + xem backtest (`?run=N` chi tiết)
- `/journal` — trades, win rate, adherence

Nhiều người dùng: nút 👤 trên thanh menu để chọn/tạo tên (unique), khóa bằng mã PIN 6 số —
tên chưa có PIN thì tạo lúc vào lần đầu; nhập đúng 1 lần thì thiết bị nhớ 1 năm. Sai 5 lần khóa 15 phút.
Đổi PIN ở nút 👤 (thiết bị khác phải nhập lại); quên PIN: gửi `/resetpin` cho bot từ chat đã kết nối.
Mỗi tên có vị thế, nhật ký, danh sách theo dõi, vốn/rủi ro riêng; tín hiệu + nhóm ngành dùng chung.
Chủ app `TruongMỡ` giữ Telegram, TCBS, watcher và cấu hình hệ thống.

Thông báo nổi trên web (🔔 trên menu): cùng nội dung cảnh báo Telegram từ cron — tín hiệu mới,
mã vào vùng mua/ngành dẫn đầu, chạm cắt lỗ/chốt lời, báo cáo vị thế, hệ thống. User khác chủ app
cũng nhận cảnh báo cắt lỗ/chốt lời cho vị thế của mình (chỉ trên web). Chọn loại ở Cài đặt → Thông báo.
Thông báo nổi tự đóng sau 12 giây (cảnh báo 30 giây), bấm vào để xem đủ nội dung. Lịch sử tự xóa:
báo cáo vị thế 2 ngày, cơ hội trong phiên 3 ngày, còn lại 7 ngày.

Ngoài web còn có (Cài đặt → Thông báo → Thông báo đẩy & Telegram riêng, lưu theo tên người dùng):
- **Thông báo đẩy** về điện thoại/máy tính kể cả khi đóng web (Web Push, khóa VAPID tự sinh lưu DB).
  iPhone/iPad: Chia sẻ → "Thêm vào MH chính", mở app từ màn hình chính rồi bật (iOS 16.4+).
- **Telegram riêng** cho user khác chủ app: bấm "Kết nối Telegram" → mở bot → Start (`/start <mã>`);
  `/stop` trong bot để ngừng nhận.

Giao diện điện thoại: thanh tab ở đáy màn hình, bảng tín hiệu/vị thế/VN30 hiện dạng thẻ.
Cài như app (PWA): nút 📲 trên menu (Chrome/Edge/Android), iPhone: Safari → Chia sẻ → "Thêm vào MH chính";
hướng dẫn thêm ở Cài đặt → Thông báo → Cài app.

## Backtest

```bash
curl -X POST localhost:3100/api/backtest -d '{
  "strategyType": "breakout-20",   # | pullback-ma20 | rsi2-revert
  "universe": "liquid",           # | vn30 | all
  "fromDate": "2025-01-01",
  "toDate": "2026-09-18"
}'
```

Engine tôn trọng luật VN: T+2 (tiền & cổ phiếu), lot 100, biên độ ±7/10/15%,
phí mua 0.15% + phí bán 0.15% + thuế bán 0.1%, slippage 0.2%, fill LO phiên
sau nếu chạm giá, sizing risk% NAV cap theo tiền mặt.

## TCBS (phase 3 — semi-auto)

`.env`: `TCBS_API_KEY` (tạo trong app TCInvest → iFlash OpenAPI) +
`TCBS_ACCOUNT_NO`. Flow auth: bot `/otp <mã iOTP>` → JWT cache trong DB.
Nút 📈 Đặt lệnh trong alert → LO order (tôn trọng `PAPER_TRADING`).

Endpoints: `POST /api/tcbs/auth` `{otp}` · `POST /api/tcbs/order` `{signalId}`
· `POST /api/tcbs/positions` (sync). Client chưa test live — verify response
shape theo `docs/tcbs-openapi.json` trước khi tắt `PAPER_TRADING`.

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

`/status` `/signals` `/positions` `/pause` `/resume` `/kill` `/auth` `/otp <mã>`

## Test

```bash
npm run test   # vitest — strategy + sizing
```
