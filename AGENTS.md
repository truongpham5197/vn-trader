# AGENTS.md — vn-trader

Trading assistant cá nhân cho cổ phiếu VN (TCBS). Next.js 16 + TypeScript +
Prisma/Postgres (Neon) + grammy. Production: Vercel `vn-trader.vercel.app`,
auto-deploy từ `main`. Repo: `github.com/truongpham5197/vn-trader`.

## 1. Lệnh dev (bắt buộc verify trước khi báo xong)

```bash
pnpm install              # KHÔNG dùng npm — npm 9.6 crash resolve vitest
pnpm dev                  # local :3000 (instrumentation bật cron+polling)
VERCEL=1 npx next start -p 3100  # prod build local — VERCEL=1 để KHÔNG
                          # bật cron/watcher chạy vào DB prod
pnpm test                 # vitest run — chạy full chỉ 1 lần ở gate cuối
pnpm vitest related <file># test liên quan trong lúc code
npx next build            # typecheck+build — PHẢI xanh trước khi commit
npx prisma db push        # sync schema → Neon (không có migration files)
```

Build local cần `DATABASE_URL` hợp lệ — `.env` đang trỏ Neon. Dùng URL dummy
`postgresql://u:p@127.0.0.1:5432/x` khi chỉ cần build (build không connect).

## 2. Kiến trúc nhanh

```
lib/data/      vndirect.ts (list mã + ngành ICB + chứng chỉ quỹ ETF/IFC →
               Symbol.kind "fund"), dnse.ts (OHLCV — có cả nến phút cho ETF),
               sync.ts, http.ts (fetch retry 3×, timeout 15s)
               events.ts — VNDirect /v4/events: GDKHQ/cổ tức/ĐHCĐ/phát hành/
               chế tài GD → CorpEvent {group,exDate,payDate,dividend,ratio}.
               Chú ý type LISTED có ngày đăng ký xa (2036) → fetch "sắp tới"
               tách riêng (UPCOMING_TYPES) sort effectiveDate desc.
               NEWS_TYPE + toNewsItem dùng chung cho fetchFundamentals +
               /api/news (lọc theo mã ?ticker= + loại ?type=dividend…).
               fundamentals.ts — VNDirect finfo: P/E P/B ROE cổ tức vốn hóa,
               DT/LN 8 quý, tin 45 ngày → summarizeFundamentals (câu dễ hiểu
               + tone) + formatFundamentalsTg. Dùng ở alert tín hiệu (scan
               gom notify cuối vòng, ≤20 mã, timeout 6s/mã), /cb MÃ, và
               GET /api/fundamentals (cache 3h) → SignalDetail ("vì sao?")
lib/strategy/  pure fns → SignalCandidate {entry,stop,target,rr,reason,plan,buyZone}
               + shouldExit per strategy. Đăng ký trong lib/strategy/index.ts
lib/backtest/  engine portfolio T+2/lot100/band ±7-10-15%/phí+thuế.
               Equity gồm tiền chờ về T+2. Thoát theo rule lấy giá phiên sau,
               không cùng nến đóng. Universe liquid tính as-of từng ngày.
               Run cũ (không engineVersion) đánh dấu cũ trên /backtest.
lib/scan.ts    nến theo requiredBars từng chiến lược (pullback mặc định 66),
               GTGD 20 phiên gần nhất. Mã giữ/theo dõi vẫn quét nhưng không
               mở BUY mới nếu thiếu thanh khoản hoặc thiếu lịch sử.
               Ghi Setting latestScanDate sau vòng scan (kể cả 0 tín hiệu).
lib/analysis/opportunity.ts  watch/waiting/actionable/extended/invalid/
               expired/stale/blocked — vùng giá không thay xác nhận chiến lược.
lib/quote-quality.ts  giá phút trong phiên ≤3 phút; ngoài giờ cần phiên đối chiếu.
lib/report/signal-health.ts  sau scan: thủng SL + giá phút mới → status expired,
               báo 1 lần, không tự bán. Cron scan gọi sau runScan.
lib/report/signal-evidence.ts  hồi cố close vs entry 5/10/20 phiên cho MỌI
               tín hiệu đã lưu — không phải PnL khớp lệnh. /gia-sau mở cho mọi user.
               (đường cũ /signals/evidence chuyển về đây; không redirect sang /signals).
lib/report/signal-outcome.ts + accountability.ts  "trả bài" gợi ý: sau scan
               gradeSignals() mô phỏng đúng kế hoạch trên nến ngày (khớp nếu về
               vùng mua ≤3 phiên, bán từ T+2, cùng nến chạm SL+TP → tính SL, hết
               HOLD_SESSIONS theo chiến lược) → Signal.outcome/outcomePct/outcomeR.
               strategyRecords() 120 ngày → dòng thành tích trong tin gợi ý, bảng
               điểm trên /gia-sau. Chiến lược ≥20 gợi ý đã chấm + TB âm = "đang
               thua" → gỡ khỏi gợi ý riêng.
               sendPersonalDigests(): mỗi user 1 tin/phiên nến (Setting digestDate)
               — bỏ mã đang giữ, trừ điểm trùng ngành, cộng mã theo dõi, KL theo
               vốn+tiền mặt user, luật thoát chiến lược của mã đang giữ, trả bài
               gợi ý cũ (xin lỗi nếu user đã mua mà thủng SL). Tin từng mã chi
               tiết (notifySignal) giờ chỉ gửi owner.
lib/learn.ts   TỰ HỌC chiến lược (sau gradeSignals trong scan, 1 lần/phiên —
               Setting learnDate): shadowScore mô phỏng lại các gợi ý đã chấm
               120 ngày (≤160 gần nhất) với từng bộ tham số lân cận ±1 bậc trên
               PARAM_LADDER — cùng tập cơ hội, khác tham số. decideMove chỉ đổi
               khi ≥20 gợi ý mẫu + lân cận TB net/lệnh tốt hơn ≥1 điểm % + sau
               lần chỉnh trước có ≥8 gợi ý chấm mới. Hill-climb chậm, giới hạn
               trong thang — không tự nghĩ giá trị. Signal.params snapshot bộ
               tham số lúc sinh tín hiệu. learnWeekly (Chủ nhật, route weekly +
               backup trong scan): xếp lân cận theo shadowScore rồi backtest
               365 ngày VN30 persist=false, OOS expectancy 30% cuối tốt hơn ≥20%
               (hoặc hiện tại âm/không đủ lệnh mà mới dương) → áp dụng; mặc định
               thắng → revert. MỌI thay đổi → model StrategyTune (kind nudge|
               weekly|revert|manual) + Telegram owner kind system. PATCH
               /api/strategies/[id] chỉnh tay cũng ghi StrategyTune manual.
lib/persona.ts + lib/report/voice.ts  giọng thông báo: 10 phong cách (User.persona,
               mặc định trải đều, user tự chọn ở /settings#thong-bao, ĐƯỢC trùng
               cả với owner). Cùng phong cách → variantOf (thứ tự id) đổi câu +
               đuôi câu nên không ai nhận tin giống ai. Chỉ là lời dẫn: không
               ra lệnh bán, không hứa lãi, chuỗi không chứa < > & (test chặn).
               Dùng ở digest, báo cáo vị thế (mã tăng/giảm mạnh nhất rổ), watcher SL/TP.
lib/persona-style.ts  văn phong lời khuyên/giải thích theo giọng: adviceStyle(persona,
               variant) → text() đổi "Lời khuyên"/"app không bán hộ", nhãn vị thế,
               tiêu đề thẻ rổ (thán từ theo biến thể), đuôi nhãn trạng thái gợi ý.
               voicedBookAdvice/voicedPositionAdvice (lib/risk/advice.ts). Web: layout
               bọc VoiceProvider (useVoice) — PositionsTable, OpportunityStatus; đổi
               giọng ở Cài đặt đổi ngay. Server: báo cáo vị thế + watcher qua styleOf().
               Số liệu, "không phải lệnh bán", "không bán hộ" phải giữ (test chặn).
lib/risk/plan.ts + personal.ts  GET /api/signals/:id/plan — KL theo vốn user cookie,
               không dùng Signal.qty dùng chung. Chỉ xem, không đặt lệnh.
lib/corp-action.ts  GDKHQ: detectAdjustment (fresh/stored factor) +
               applyCorporateAction (×factor vào bars cũ + Trade/Signal mở)
lib/risk/      sizing.ts (1% NAV, lot 100), suggest.ts (/plan gợi ý SL/TP),
               plan.ts + personal.ts (KL theo từng user — xem mục scan ở trên)
               levels.ts — levelState(giá, SL, TP): "đã thủng cắt lỗ −X%" (giá ≤ SL)
               tách khỏi "sát cắt lỗ" (còn trên SL ≤3%), tương tự chốt lời —
               dùng chung badge web, báo cáo vị thế Telegram, cảnh báo watcher.
               advice.ts — thẻ gợi ý cả rổ chỉ cảnh báo theo SL/TP đã đặt
               (trung bình giá / lỗ / chốt lời), giọng vui. Có thể khuyên bán
               hoặc chưa mua thêm — là lời khuyên, không đặt lệnh, không hứa lãi.
               % cần để hòa vốn là hệ thức f/(1−f).
               Watcher thủng cắt lỗ: báo 1 lần, không đóng vị thế, không đặt lệnh.
               Sửa SL/TP qua PATCH trade → gỡ dấu stop-hit/target-hit để báo lại
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
               ngành <3 mã = kém tin cậy; top 5 mã từ ngành mạnh. Mỗi ngành
               có rank/summary/why (từng thước đo kèm hạng X/N), mỗi pick có
               why = bối cảnh ngành + scoreSetup.facts (số liệu cụ thể). Dùng ở
               /sectors + Telegram /nganh. `live` ghép nến hôm nay từ DNSE
               (GTGD quy đổi cả phiên theo sessionElapsed);
               sector-live.ts — 9h–16h T2–T6 dùng bản live (cache 5ph),
               ngoài giờ bản cuối ngày (15ph); runSectorAlerts gọi từ
               watcher qua after(), tự giãn 5ph, báo mã vào vùng mua +
               ngành lên dẫn đầu, dedup/ngày (Setting sectorAlerted)
lib/telegram/  bot.ts (createBot — dùng chung polling+webhook), notify.ts
               (sendTelegram + esc() — PHẢI escape text động, parse_mode=HTML).
               sendTelegram(text, buttons?, web?) — web: WebAlert {kind, level,
               ticker, userId} → ghi thêm thông báo web (lib/alerts.ts pushAlert;
               userId bỏ trống = owner, null = mọi người). Cảnh báo mới từ cron
               nhớ gắn web để hiện nổi trên web
lib/alerts.ts  model Alert, pushAlert/listAlerts/htmlToAlert; pruneAlerts xóa
               theo loại (KEEP_DAYS: positions 2 ngày, sector 3, còn lại 7) —
               cron scan gọi mỗi ngày + pushAlert tự gọi ≤6h/lần.
               pushAlert → fanOut: Telegram riêng (user khác owner có
               User.tgChatId; 403 → gỡ liên kết) + Web Push (PushSub, lib/push.ts,
               VAPID tự sinh lưu Setting "vapidKeys" — không cần env; 404/410 →
               xóa sub), lọc theo User.alertKinds. Push: tag gom vt-kind-ticker
               (tin mới thay tin cũ cùng loại — báo cáo 30ph không chất chồng),
               TTL theo loại (positions 15ph, sector 1h, stop/target 6h,
               signal/system 12h), danger → urgency high + renotify +
               requireInteraction trên sw.js.
               lib/alert-kinds.ts = ALERT_KINDS + alertHref + type dùng chung client.
               watcher.watchOthers(): vị thế user khác owner chạm SL/TP → chỉ
               báo web (không Telegram, không tự đóng), note stop-hit/target-hit
               để báo 1 lần; positions-report cũng push báo cáo cho từng user
app/api/push   GET {publicKey} · POST PushSubscription.toJSON() + {sync?} (upsert
               theo endpoint, gắn user cookie; sync=true chỉ gắn lại khi
               pushEnabled còn bật, còn thì trả skipped → client tự unsubscribe —
               POST thường/nút Bật mở lại pushEnabled) · DELETE {endpoint} = 1
               thiết bị, {all:true} = tắt đẩy CẢ TÀI KHOẢN (User.pushEnabled=false
               + xóa mọi PushSub → PWA điện thoại ngừng nhận). POST /api/push/test
               gửi thử tới thiết bị của user (payload force → sw.js hiện cả khi
               web đang focus; bình thường bỏ qua vì đã có toast) — nút 🔔 Gửi thử. public/sw.js nhận
               push (bỏ qua nếu web đang focus), app/manifest.ts = PWA (iOS
               16.4+ phải "Thêm vào MH chính" mới có push). InstallApp.tsx:
               đăng ký sw.js khi mở web (điều kiện cài PWA), giữ
               beforeinstallprompt → nút 📲 trên Nav (iOS: modal hướng dẫn
               Chia sẻ), ẩn khi standalone; InstallCard ở /settings#thong-bao.
               Bảng chuông 🔔 = portal fixed (header backdrop-blur + chuông không
               sát mép phải → trước đây bị cắt trên điện thoại)
app/api/me     GET/PATCH {alertKinds} — loại thông báo đẩy/Telegram riêng
app/api/telegram/link  POST → mã 1 lần + t.me/<bot>?start=<mã>; DELETE gỡ.
               Bot /start <mã> gắn chat với user, /stop gỡ — 2 lệnh này KHÔNG
               check allowed(); mọi lệnh khác vẫn chỉ owner chat.
               UI: app/components/PushSettings.tsx ở /settings#thong-bao
app/api/alerts  GET ?after=id → thông báo của user hiện tại + chung.
               Client app/components/AlertCenter.tsx: chuông 🔔 trên Nav + toast
               nổi (portal) — poll 30s trong phiên, 60s 15h–17h30, 5ph còn lại,
               lần đầu mở không bắn lại cũ; toast tự đóng 12s (warn/danger 30s),
               bấm mở Modal xem đủ nội dung; chọn loại ở /settings#thong-bao
               (localStorage vt_alert_prefs). Mobile: Nav có thanh tab đáy
               (sm:hidden, ngoài header vì backdrop-blur), bảng → thẻ dưới sm
lib/tcbs/      OpenAPI client (spec: docs/tcbs-openapi.json)
lib/jobs.ts    node-cron local — SKIP khi process.env.VERCEL
app/api/cron/  eod-sync (cursor resume qua Setting eodSyncCursor + chain
               after() + deadlineMs 40s + retry 3×),
               scan (CN gọi thêm learnWeekly), watcher, positions-report,
               weekly (báo cáo tuần + learnWeekly)
               — TẤT CẢ qua cron-auth
app/api/quotes    GET ?tickers=A,B → giá nến 1m DNSE (cache 30s trong
               getQuote) — client KHÔNG tự poll: dùng app/components/live.tsx
               (QuotesProvider trong layout, gom mã đang hiện trên màn hình,
               20s trong phiên / 5ph ngoài, tab ẩn thì dừng): useQuote/
               useQuotes/LivePrice/LiveBadge
app/api/symbols   GET ?q= → ≤8 mã (mã/tên công ty, bỏ dấu) cho StockSearch
               trên Nav ("/" để focus) → /stock/[ticker]
app/api/events    GET ?ticker= → CorpEvent[] (cache 30ph) — trống = toàn TT
app/api/news      GET ?ticker=&type= → tin theo mã/loại (cache 1h); không
               ticker bắt buộc type. Loại hợp lệ = keys(NEWS_TYPE)
app/api/telegram/webhook  production bot endpoint (secret header check)
app/api/telegram/commands POST → setMyCommands (menu "/" của bot) — gọi
               từ Vercel vì mạng local chặn api.telegram.org
app/api/settings  POST {key,value} — web dashboard chỉnh: navVnd, riskPct
               (TỶ LỆ 0.01=1%, chặn ≤0.03), universe, universeMinValueVnd,
               scanEnabled, killSwitch (bật → tắt scan, báo Telegram).
               paperTrading KHÔNG sửa từ web. KHÔNG auth — user chọn
               2026-09-22 (UI không cần password); an toàn dựa vào validate
               + báo Telegram mỗi lần đổi scanner/kill
app/api/trades, trades/[id]  CRUD vị thế từ web: POST mở (thiếu SL/TP →
               lib/risk/quick.ts −/+8% theo giá vốn, form web tự tính sẵn), PATCH sửa /
               {close,exit} bán (closeTrade), DELETE — báo Telegram
app/api/signals/[id]  PATCH take|skip|reset, DELETE (gỡ link trade/order)
app/api/strategies/[id]  PATCH {enabled, params} — params merge defaults,
               chặn key lạ / ≤0, {} = về mặc định; đổi params ghi
               StrategyTune kind manual (lib/learn.ts dùng cho cooldown)
app/api/watchlist  POST/DELETE {ticker} → User.watchlist (theo cookie) —
               scan luôn quét các mã này (như held tickers)
lib/user.ts    Nhiều user, không login nhưng có PIN 6 số (2026-09-23): model User
               (username unique, không phân biệt hoa thường). Cookie `vt_user`
               = `id.sessionVer.hmac` (lib/pin.ts, 1 năm) ký bằng env
               SESSION_SECRET hoặc Setting "sessionSecret" tự sinh; sai chữ ký /
               lệch sessionVer / cookie kiểu cũ (chỉ id) → GUEST, hỏi lại PIN.
               Owner `TruongMỡ` (User.owner) = chủ app: Telegram, TCBS
               Position, watcher (auto stop/target, lệnh live), orders,
               weekly, /picks, NAV/risk ở Setting chung. User khác: Trade
               (userId), watchlist (User.watchlist), navVnd/riskPct riêng
               (null → mặc định Setting). Signal + trạng thái skip/reset/
               xóa + cấu hình hệ thống = dùng chung, CHỈ owner đổi; user
               khác "Đã mua" tạo trade riêng, không đổi status signal.
               Scan quét allWatchlists() + trade mở của mọi user. Server
               path không có user (bot/cron) → ownerId(). Web chưa chọn
               tên → GUEST (id 0, danh sách trống), API mutate trả 401
app/api/users  GET list {hasPin} · POST {username, pin, create?}: tạo tên
               kèm PIN / tên chưa có PIN → PIN gửi lên thành PIN (updateMany
               where pinHash null) / có PIN → scrypt check, sai 5 lần khóa 15ph
               (pinFails tăng nguyên tử) · PATCH {pin,newPin} đổi PIN, tăng
               sessionVer (thiết bị khác thoát) · DELETE thoát. UI: UserSwitcher.
               Quên PIN: bot /resetpin (chat owner → PIN owner, chat đã liên
               kết → PIN user đó) xóa pinHash + tăng sessionVer
lib/trades.ts  netPnl/closeTrade/takeSignal/watchlist — dùng chung bot+web
lib/api.ts     pos()/bad()/body() validate cho route web
app/components/ui.tsx  Button/Modal/ModalForm/toast/useApi (refresh sau lưu)
app/components/Fundamentals.tsx  useFundamentals (cache promise, lazy IO),
               FundBadge/BusinessBox/NewsList; PickCard.tsx thẻ gợi ý live
lib/fees.ts    BUY_FEE/SELL_FEE_TAX/netPnl/netPnlPct — dùng chung server+client
Trang: / (tổng quan), /signals (chip ngày + tab trạng thái), /journal,
               /su-kien (sự kiện doanh nghiệp + tin cổ tức + bảng giá chứng
               chỉ quỹ; lọc theo mã; /stock cũng có thẻ Sự kiện + chip lọc
               loại tin ở NewsList),
               /sectors, /backtest, /settings (cấu hình, chiến lược, theo dõi),
               /stock/[ticker] (giá live, biểu đồ, setup+lý do, ngành, vị thế,
               tín hiệu, kinh doanh/tin, nút theo dõi)
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
  Ngoại lệ: route web `/api/settings|trades|signals|strategies|watchlist`
  (user quyết định UI không password) — bắt buộc validate server-side.
  Dữ liệu cá nhân (trade/watchlist/vốn/push/Telegram riêng) giờ theo cookie
  phiên có chữ ký sau khi nhập PIN — KHÔNG tin id thô từ cookie/body.
  KHÔNG log PIN/pinHash/sessionSecret.

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
- `Signal.date` = ngày NẾN (phiên đã đóng), dùng cho phiên kế tiếp. Lọc
  theo `vnToday()` → 0 tín hiệu tới khi scan chiều chạy → dùng
  `latestSignalDate()` (lib/signals.ts). Trước 2026-09-23 web+bot lọc sai
  → user thấy "tín hiệu cũ".
- universe `vn30` cho 0 tín hiệu nhiều ngày → default giờ `liquid`.
- Neon free: connection drop thoáng qua → retry query hoặc chấp nhận DataGap.
- TCBS public API (apipubaws) bị Cloudflare challenge → không lấy được
  fundamentals từ TCBS. Dùng VNDirect `api-finfo` v4: ratios itemCode 51003
  vốn hóa/51006 PE/51012 PB/51033 cổ tức/52002 ROE; financial_statements
  21001 DT thuần, 421701 tổng thu nhập (NH), 23000 LNST cty mẹ (VND).
- Tín hiệu vẫn chỉ do giá + khối lượng; khối kinh doanh/tin chỉ tham khảo
  — giữ disclaimer, đừng biến thành "khuyến nghị".
- `quoteFresh` không được coi 9:00–15:00 là khớp liên tục. Nghỉ trưa
  11:30–13:00 và sau ATC 14:45–15:00 không có nến 1 phút mới — dùng giá khớp
  cuối của phiên liên tục vừa xong và nói rõ, đừng hiện "Chờ dữ liệu mới".
- Vùng mua có đáy ≤ cắt lỗ là kế hoạch hỏng (mua ở đáy vùng đã chạm cắt lỗ).
  `buyZoneAboveStop` khi sinh vùng mới; UI đánh "không dùng được" với vùng cũ.
