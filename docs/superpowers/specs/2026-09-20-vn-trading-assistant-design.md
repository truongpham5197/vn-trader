# VN Trading Assistant — Design Spec

Ngày: 2026-09-20
Trạng thái: Draft — chờ user review
Owner: cá nhân (single-user, self-hosted)

## 1. Mục tiêu

Web app cá nhân hỗ trợ trading cổ phiếu cơ sở Việt Nam (HOSE/HNX/UPCOM) theo
quy trình có hệ thống: **chiến lược → backtest → tín hiệu → vào lệnh có kỷ
luật → journal rút kinh nghiệm**. Tài khoản đặt lệnh: TCBS qua TCBS OpenAPI
(iFlash), semi-auto (bot hỏi trước khi đặt, không tự ý).

App **không** hứa lợi nhuận. Giá trị của app nằm ở việc enforce quy trình:
chỉ vào lệnh khi có tín hiệu đã backtest, luôn có stop/size tính sẵn, journal
đo adherence giữa kế hoạch và hành vi thật.

## 2. Out of scope (MVP)

- Phái sinh (VN30F), margin, shorting, intraday strategies
- News sentiment / AI summarization
- Multi-user, auth phức tạp, mobile app
- Full-auto trading (mọi lệnh đều qua confirm của user trong Telegram)

## 3. Stack

- Next.js 15 (App Router) + TypeScript — UI + API routes + server actions
- `vn-stock-sdk` (TypeScript) — data OHLCV/fundamentals, failover
  TCBS → VNDirect → DNSE (public API, không cần key)
- TCBS OpenAPI (iFlash) — auth API key + OTP → JWT; đặt lệnh, đọc tài khoản
- `grammY` — Telegram bot (alerts + inline buttons + commands)
- Prisma + SQLite — DB (đủ cho single-user, nâng Postgres sau nếu cần)
- `node-cron` trong `instrumentation.ts` — jobs EOD sync, scan, watcher
- `lightweight-charts` — equity curve, price chart trong dashboard
- Deploy: **local-first** (máy Windows chạy persistent process); Railway/VPS
  nhỏ là option sau. Không dùng Vercel cron vì cần watcher trong phiên.

## 4. Kiến trúc

```
Next.js 15
├── app/ (dashboard): /signals, /positions, /journal, /backtest, /settings
├── app/api:
│   ├── cron/eod-sync      → kéo OHLCV EOD qua vn-stock-sdk
│   ├── cron/scan          → 15:30 ICT chạy strategies → Signal → Telegram
│   ├── telegram/webhook   → bot commands + inline button callbacks
│   ├── tcbs/auth|orders|positions → proxy TCBS OpenAPI (JWT cache)
│   └── backtest/run|list  → chạy backtest, lưu/xem kết quả
├── lib/
│   ├── data/      vn-stock-sdk wrapper, rate limit, nguồn failover, gap log
│   ├── strategy/  pure functions: (bars[], params) → SignalCandidate | null
│   ├── backtest/  engine + luật VN (§6) + metrics
│   ├── risk/      position sizing, limits, kill switch (§9)
│   ├── telegram/  bot client, message templates, OTP flow
│   └── tcbs/      OpenAPI client: token cache, placeOrder, account, positions
└── prisma/schema.prisma → SQLite file
```

## 5. Data model (Prisma)

| Model | Trường chính |
|-------|--------------|
| `Symbol` | ticker, exchange(HOSE/HNX/UPCOM), industry, bandPct, active |
| `DailyBar` | symbolId, date, o/h/l/c/v, value — unique(symbolId,date) |
| `Strategy` | name, type, params JSON, enabled, universeFilter JSON |
| `Signal` | strategyId, symbolId, date, entry, stop, target, qty, rr, status(new/notified/taken/skipped/expired/filled), unique(strategy,symbol,date) |
| `Order` | signalId?, tcbsOrderId?, side, qty, price, type(LO/MP), status, placedAt, filledAt, mode(paper/live) |
| `Trade` | symbolId, openOrderId, closeOrderId?, qty, entryPrice, exitPrice?, pnl?, status(open/closed), signalId?, tags, note |
| `Position` | symbolId, qty, sellableQty, avgPrice, syncedAt (cache từ TCBS) |
| `BacktestRun` | strategyType, params, symbolUniverse, period, metrics JSON, equity JSON, trades JSON, createdAt |
| `Setting` | key/value: nav, riskPct, maxPositions, maxSectorPct, dailyLossLimit, killSwitch, paperTrading |

## 6. Luật thị trường VN trong backtest & order logic

- **T+2 settlement**: tiền bán về sau 2 phiên; watcher chỉ bán `sellableQty`
- **Lot 100**: mọi qty là bội số 100 (lô lẻ bỏ qua trong MVP)
- **Biên độ**: ±7% HOSE / ±10% HNX / ±15% UPCOM — order không khớp ngoài
  band; skip tín hiệu mua khi giá = trần
- **Phí & thuế**: phí mua 0.15% + phí bán 0.15% + thuế bán 0.1% (config);
  slippage param (mặc định 0.2%)
- Không day-trade (mua và bán cùng mã cùng ngày), không short

## 7. Chiến lược khởi đầu (lib/strategy — pure, dễ unit test)

1. **pullback-ma20**: close > MA50 (uptrend), giá pullback chạm MA20,
   volume < 0.8× avg20 → entry LO next session, stop = swing low hoặc
   1.5×ATR14, target = 2R
2. **breakout-20**: close > max(high,20) AND volume > 1.5×avg20 AND
   close < ceiling → entry, stop = 2×ATR14, trailing theo MA10
3. **rsi2-revert**: uptrend (close>MA50) + RSI(2)<5 → entry, exit RSI>70
   hoặc time-stop 5 phiên

Interface chung: `evaluate(ctx) → { entry, stop, target, reason } | null`.
Universe mặc định: ~300 mã GTGD TB 20 phiên > 5 tỷ VND.

## 8. Scanner & Telegram flow

- **15:30 ICT** (sau giờ đóng cửa, data settle): load bars mới nhất →
  strategies × universe → upsert `Signal` (idempotent) → gửi Telegram:
  ```
  FPT — breakout-20
  Entry 125.0 (LO) | Stop 119.5 (-4.4%) | Target 136.0 | R:R 2.0
  Size 400cp ≈ 50.0tr (risk 1.0% NAV)
  [Đặt lệnh] [½ size] [Bỏ qua]
  ```
- Bot commands: `/status` `/positions` `/pnl` `/signals` `/pause` `/resume`
  `/kill`
- 8:45 ICT (optional phase sau): recheck signal vs giá mở cửa, hủy nếu gap
  quá X%

## 9. Risk controls (hard rules, server-enforced, không bypass qua UI)

- Sizing: `qty = floor(NAV × riskPct / (entry − stop) / 100) × 100`;
  `riskPct` mặc định 1%
- `maxPositions` mặc định 5; `maxSectorPct` 40%
- Daily loss lockout: P&L ngày ≤ −2% NAV → chặn lệnh mới tới hết phiên
- `KILL_SWITCH` env var + `/kill` command → hủy watcher, chặn mọi order
- **`PAPER_TRADING=true` là default**: Order ghi DB, không bắn TCBS.
  Chỉ bật live sau khi backtest expectancy dương + paper chạy ≥ 2 tuần

## 10. TCBS integration (phase 3)

- Auth: API key + OTP → JWT (cache trong memory + expiry). Hết hạn → bot
  chủ động hỏi OTP, user rep trong chat
- "Đặt lệnh" → LO entry order qua OpenAPI; record `Order` + link `Signal`
- **Stop-loss watcher** (feature cốt lõi — broker VN không có stop order
  cơ sở): mỗi 30–60s trong phiên, poll giá positions → chạm stop → bán MP
  (chỉ trên `sellableQty`, tôn trọng T+2); alert Telegram mọi hành động
- Position sync định kỳ → reconcile `Trade`; phát hiện lệnh đặt tay ngoài
  app → tạo Trade không link Signal (adherence tracking)

## 11. Journal & báo cáo (phase 4)

- Trade auto-link Signal → adherence: theo tín hiệu? giữ stop? size đúng?
- Telegram báo cáo tuần (Chủ nhật): P&L tuần, win rate, % tuân thủ kế
  hoạch, lỗi lớn nhất (move stop, oversize, chase)
- Dashboard: equity curve, trade list, per-strategy stats, drawdown

## 12. Error handling & ops

- Data failover: vn-stock-sdk đổi nguồn; ghi `DataGap` log khi thiếu bar;
  scan skip symbol thiếu data
- Idempotent: Signal unique (strategy,symbol,date); order retry an toàn
- Rate limit: batch EOD sync theo giới hạn nguồn (~20–60 req/phút)
- Secrets trong `.env`: TCBS_API_KEY, TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID — không commit
- Mọi order action (kể cả paper) ghi audit log

## 13. Testing

- Unit: 3 strategy functions trên fixture bars; sizing math; fee/band/T+2
  rules trong engine
- Integration: scanner end-to-end trên canned EOD data → expected signals;
  TCBS client mocked; Telegram webhook handler mocked
- Paper mode = integration test với thị trường thật

## 14. Phasing

| Phase | Scope | Done khi |
|-------|-------|----------|
| 1 — Alert-only | Schema + EOD sync + 1 strategy (breakout-20) + scanner 15:30 + Telegram alert + /status | Nhận tín hiệu hằng ngày ổn định |
| 2 — Backtest | Engine §6 + UI run/xem kết quả + 3 strategies + so VNINDEX | Biết strategy nào có edge |
| 3 — TCBS live | Auth OTP flow + nút Đặt lệnh + stop-loss watcher + position sync | Vào/cắt lệnh semi-auto, paper→live |
| 4 — Discipline | Journal auto + adherence + báo cáo tuần | Biết bạn hay chiến lược đang sai |

Mỗi phase ship độc lập; phase 3 không bắt đầu trước khi phase 2 có ít nhất
1 chiến lược expectancy dương trên ≥3 năm data.

## 15. Giả định cần verify khi implement

- TCBS OpenAPI: JWT lifetime, OTP flow chính xác, rate limit endpoint
  account/order (docs: developers.tcbs.com.vn)
- vn-stock-sdk coverage: toàn bộ mã HOSE/HNX/UPCOM + GTGD để lọc universe
- Giờ settle data EOD của nguồn public (có thể phải scan 16:30 thay 15:30)
