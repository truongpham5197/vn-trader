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
lib/corp-action.ts  GDKHQ: detectAdjustment (fresh/stored factor) +
               applyCorporateAction (×factor vào bars cũ + Trade/Signal mở)
lib/risk/      sizing.ts (1% NAV, lot 100), suggest.ts (/plan gợi ý SL/TP)
lib/report/    positions.ts — báo cáo vị thế % live (dùng chung bot+cron);
               top-picks.ts — collectTopPicks + formatTopPicks cho /picks
               (preview tay). Auto-push digest ĐÃ GỠ 2026-09-22 — spam mỗi
               5ph không hiệu quả; route cron + schedule + runTopPicksDigest
               xóa, không còn đường gửi nào;
               sectors.ts — bảng nhóm ngành cho /sectors (vị thế mở +
               signal ngày mới nhất + setup VN30, kèm GDKHQ gần nhất)
lib/analysis/  vn30.ts (scoreSetup — vùng mua/SL/TP + `plain` cho người mới);
               sector-strength.ts — xếp hạng ngành trên mã GTGD≥ngưỡng:
               lãi 1 tuần/1 tháng (trung vị), % mã > MA50, dòng tiền 5p/20p,
               ngành <3 mã = kém tin cậy; top 5 mã từ ngành mạnh. Dùng ở
               /sectors (unstable_cache 15ph) + Telegram /nganh
lib/telegram/  bot.ts (createBot — dùng chung polling+webhook), notify.ts
               (sendTelegram + esc() — PHẢI escape text động, parse_mode=HTML)
lib/tcbs/      OpenAPI client (spec: docs/tcbs-openapi.json)
lib/jobs.ts    node-cron local — SKIP khi process.env.VERCEL
app/api/cron/  eod-sync (cursor resume qua Setting eodSyncCursor + chain
               after() + deadlineMs 40s + retry 3×),
               scan, watcher, positions-report, weekly
               — TẤT CẢ qua cron-auth
app/api/quotes    GET ?tickers=A,B → giá nến 1m DNSE (cache 30s trong
               getQuote) — SectorBoard poll 30s trong phiên / 5ph ngoài
app/api/telegram/webhook  production bot endpoint (secret header check)
app/api/telegram/commands POST → setMyCommands (menu "/" của bot) — gọi
               từ Vercel vì mạng local chặn api.telegram.org
app/api/settings  POST {key,value} — web dashboard chỉnh: navVnd, riskPct
               (TỶ LỆ 0.01=1%, chặn ≤0.03), universe, universeMinValueVnd,
               scanEnabled, killSwitch (bật → tắt scan, báo Telegram).
               paperTrading KHÔNG sửa từ web. KHÔNG auth — user chọn
               2026-09-22 (UI không cần password); an toàn dựa vào validate
               + báo Telegram mỗi lần đổi scanner/kill
```

Vercel Hobby: function ≤60s, không process nền, cron 1 lần/ngày → mọi job nặng
phải chunked + self-chain, watcher intraday cần ping ngoài
(cron-job.org, TZ Asia/Ho_Chi_Minh, T2-T6 — xem/sửa qua API bằng
`CRON_JOB_API_KEY` trong .env:
watcher mỗi phút 9-11h + 13-14h (bỏ nghỉ trưa 12h);
positions-report :20/:50 giờ 9-11,13-14 (11:50 = chốt phiên sáng,
14:50 = sau ATC); eod-sync */2 15-16h — route tự bỏ qua trước 15:10
(DNSE chưa chốt nến ngày), resume cursor, hết vòng mà HOSE < 80% nến
phiên trước → quét lại (≤3 lượt), xong thì ping kế tiếp chạy scan.
Vercel cron: eod-sync 15:20 + scan 16:50 chỉ là fallback — scan idempotent).

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
  Ngoại lệ duy nhất: `/api/settings` (web UI, user quyết định không password).

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

- **BẮT BUỘC (user rule 2026-09-21):** làm xong → push nhánh `feat|fix/<slug>`
  → `gh pr create` với summary để user duyệt → **KHÔNG push/merge thẳng `main`**.
- `main` merge → auto-deploy production Vercel. Commit atomic, message
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
  Chain self-fetch **đứt ngẫu nhiên sau vài hop** (đã gặp 09-2026, chỉ ~23-113/860
  mã được sync) → luôn resume qua `eodSyncCursor`, không dựa vào chain.
- `/kill` set killSwitch=true + scanEnabled=false; `/resume` giờ clear cả hai —
  trước 2026-09-22 chỉ bật scanEnabled nên pipeline vẫn bị killSwitch chặn.
- DNSE trả OHLC **đã điều chỉnh lùi** sau GDKHQ → bars cũ trong DB lệch scale;
  syncDailyBars detect qua detectAdjustment → applyCorporateAction nhân factor
  vào bars + Trade/Signal mở. Position (live) không đụng — TCBS tự adjust.
- Sync ngay 15:00 → DNSE chưa có nến hôm nay cho phần lớn HOSE (2026-09-22
  chỉ 28/405 mã) mà cursor vẫn đánh dấu xong → scan chạy trên data cũ. Giờ
  chặn trước 15:10 + kiểm tra độ phủ HOSE trước khi coi là xong.
- `setTimeout(Infinity)` bị Node ép về 1ms → syncDailyBars không truyền
  deadlineMs từng làm mọi mã fail "deadline"; chỉ race khi có deadline.
- Neon free: connection drop thoáng qua → retry query hoặc chấp nhận DataGap.
