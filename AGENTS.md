# AGENTS.md — vn-trader

Trading assistant cá nhân cho cổ phiếu VN (TCBS). Next.js 16 + TypeScript +
Prisma/Postgres (Neon) + grammy. Production: Vercel `vn-trader.vercel.app`,
auto-deploy từ `main`. Repo: `github.com/truongpham5197/vn-trader`.

## 1. Lệnh dev (bắt buộc verify trước khi báo xong)

```bash
pnpm install              # KHÔNG dùng npm — npm 9.6 crash resolve vitest
pnpm dev                  # local :3000 (instrumentation bật cron+polling)
npx next start -p 3100    # production build local
pnpm test                 # vitest run — chạy full chỉ 1 lần ở gate cuối
pnpm vitest related <file># test liên quan trong lúc code
npx next build            # typecheck+build — PHẢI xanh trước khi commit
npx prisma db push        # sync schema → Neon (không có migration files)
```

Build local cần `DATABASE_URL` hợp lệ — `.env` đang trỏ Neon. Dùng URL dummy
`postgresql://u:p@127.0.0.1:5432/x` khi chỉ cần build (build không connect).

## 2. Kiến trúc nhanh

```
lib/data/      vndirect.ts (list mã + ngành ICB), dnse.ts (OHLCV), sync.ts,
               http.ts (fetch retry 3×, timeout 15s)
lib/strategy/  pure fns → SignalCandidate {entry,stop,target,rr,reason,plan,buyZone}
               + shouldExit per strategy. Đăng ký trong lib/strategy/index.ts
lib/backtest/  engine portfolio T+2/lot100/band ±7-10-15%/phí+thuế
lib/scan.ts    batch-load bars → filter GTGD>5tỷ + held tickers luôn qua →
               upsert Signal idempotent → notifySignal
lib/risk/      sizing.ts (1% NAV, lot 100), suggest.ts (/plan gợi ý SL/TP)
lib/report/    positions.ts — báo cáo vị thế % live (dùng chung bot+cron)
lib/telegram/  bot.ts (createBot — dùng chung polling+webhook), notify.ts
               (sendTelegram + esc() — PHẢI escape text động, parse_mode=HTML)
lib/tcbs/      OpenAPI client (spec: docs/tcbs-openapi.json)
lib/jobs.ts    node-cron local — SKIP khi process.env.VERCEL
app/api/cron/  eod-sync (chain after() + deadlineMs 40s + retry 3×),
               scan, watcher, positions-report, weekly — TẤT CẢ qua cron-auth
app/api/telegram/webhook  production bot endpoint (secret header check)
```

Vercel Hobby: function ≤60s, không process nền, cron 1 lần/ngày → mọi job nặng
phải chunked + self-chain, watcher intraday cần ping ngoài (cron-job.org).

## 3. Quy tắc an toàn (không phá)

- `PAPER_TRADING=true` là default. Không set false trừ khi user yêu cầu rõ
  **và** đã có backtest expectancy dương ≥3 năm data + TCBS live tested.
- `KILL_SWITCH` env + Setting `killSwitch` — không bypass.
- Không bao giờ mua vượt ceiling / bán dưới floor (bandPct trên Symbol).
- Tôn trọng T+2: `availableQty` mới bán được.
- Backtest `breakout-20` trên data hiện có: **−21.7%** — đừng bảo user vào
  tiền thật khi chưa có chiến lược nào chứng minh edge.
- +5% là mục tiêu user đặt, không phải cam kết — luôn nói rõ.

## 4. Secrets — tuyệt đối

- `.env` đã ignore; `.env.example` là ngoại lệ duy nhất được commit.
- KHÔNG paste token/connection string vào file track được, log, hay comment.
- `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET` đã lộ trong chat → cần
  rotate (Neon console + @BotFather `/revoke`), update Vercel env sau.
- Route mutating bắt buộc `cronAuthorized()` / webhook secret check.

## 5. Coding conventions (theo code hiện có)

- TS strict, ESM, path alias `@/`. Tên định danh tiếng Anh; comment giải
  thích tiếng Việt được (đang dùng sẵn — giữ thống nhất).
- File lib kebab-case (`pullback-ma20.ts`); component `PascalCase.tsx` hiện có
  (`SignalTable.tsx`) — theo file lân cận, không rename hàng loạt.
- Giá VN trong code = **nghìn đồng** (GAS 91.28 = 91,280đ). value = VND thật.
- Telegram message: parse_mode HTML → mọi chuỗi động phải qua `esc()` —
  đã có sự cố `< MA10` trong plan phá markup.
- Nguồn data public (DNSE/VNDirect) hay 429/500 thoáng qua → luôn qua
  `fetchJson` có retry; DataGap table ghi mã không lấy được.
- Compact code, không comment thừa, không try/catch từng dòng — đúng error
  boundary (chain after() có outer catch + retry).

## 6. Git

- `main` push → auto-deploy production Vercel. Commit atomic, message
  conventional (`fix:`/`feat:`/`perf:`/`chore:`/`docs:`), tiếng Việt ngắn gọn.
- Không push lộn file tạm. Scratch/screenshot/script tạm →
  `D:\project\BuildLab\scratch\vn-trader\`, không ghi vào repo.

## 7. Quy trình nhẹ (solo project — không áp pipeline 9-vai-tro của BuildLab)

1. Đọc code liên quan trước khi sửa; theo convention file đó.
2. Sửa → `vitest related` + build xanh → mới commit.
3. Sau deploy production: smoke test route vừa đổi (curl status 200).
4. Thay đổi cách chạy/config → cập nhật file này + README.
5. Gặp lỗi lặp lại ở runtime → fix root cause + ghi vào AGENTS.md mục này
   nếu là lesson dài hạn (vd: chain 60s, HTML escape, pnpm-vs-npm).

## 8. Known gotchas đã gặp (đừng lặp)

- npm 9.6 arborist crash với vitest → dùng pnpm.
- VNDirect `/stocks` pagination drift mất ~250 mã → query per-floor size=1000.
- `roundTick` xô stop lên = entry khi ATR nhỏ → stop/target dùng `floorTick`.
- prisma generate EPERM khi `next start` đang chạy → kill server trước.
- Prisma relation là `bars`, không phải `dailyBars`.
- `after()` chain trên Vercel: handler phải return ngay, work+chain trong
  after(); batch ≤40s (deadlineMs), retry cùng offset khi Neon hiccup.
- Neon free: connection drop thoáng qua → retry query hoặc chấp nhận DataGap.
