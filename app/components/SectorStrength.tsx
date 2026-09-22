import type { SectorPick, SectorStrength as Data, SectorTrend } from "@/lib/analysis/sector-strength";

const TREND: Record<SectorTrend, { label: string; cls: string }> = {
  lead: { label: "🚀 Dẫn đầu", cls: "border-gain/40 bg-gain/15 text-gain" },
  strong: { label: "📈 Mạnh", cls: "border-gain/30 bg-gain/5 text-gain" },
  neutral: { label: "➖ Đi ngang", cls: "border-border text-muted" },
  weak: { label: "📉 Yếu", cls: "border-loss/30 bg-loss/5 text-loss" },
};

// Giá trong DB = nghìn đồng → hiển thị đồng cho người mới (31.4 → 31.400đ)
const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const tone = (v: number) => (v >= 0 ? "text-gain" : "text-loss");

function marketVerdict(breadth: number): string {
  if (breadth >= 60) return "Thị trường thuận lợi — đa số cổ phiếu đang trong xu hướng tăng.";
  if (breadth >= 40) return "Thị trường giằng co — chỉ nên mua ở các ngành mạnh, mua ít.";
  return "Thị trường yếu — đa số cổ phiếu đang giảm, ưu tiên đứng ngoài quan sát.";
}

function flowText(f: number): { text: string; cls: string } {
  if (f >= 1.3) return { text: `💰 Tiền vào mạnh ×${f.toFixed(1)}`, cls: "text-gain" };
  if (f >= 1.05) return { text: `Tiền vào ×${f.toFixed(2)}`, cls: "text-gain" };
  if (f > 0.9) return { text: `Bình thường ×${f.toFixed(2)}`, cls: "text-muted" };
  return { text: `Tiền rút ra ×${f.toFixed(2)}`, cls: "text-loss" };
}

function PickCard({ p, sector }: { p: SectorPick; sector?: string }) {
  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">{p.ticker}</span>
        <span className="text-[11px] text-muted">{p.setup}</span>
      </div>
      {(p.companyName || sector) && (
        <div className="truncate text-[11px] text-muted">{[sector, p.companyName].filter(Boolean).join(" · ")}</div>
      )}
      <dl className="num mt-2 space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Vùng mua</dt>
          <dd className="font-semibold">
            {dong(p.buyZone[0])} – {dong(p.buyZone[1])}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Cắt lỗ nếu rơi về</dt>
          <dd className="text-loss">
            {dong(p.stop)} (−{p.riskPct.toFixed(1)}%)
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Chốt lời ở</dt>
          <dd className="text-gain">
            {dong(p.target)} (+{p.upsidePct.toFixed(1)}%)
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">{p.plain}</p>
    </div>
  );
}

export default function SectorStrength({ data }: { data: Data }) {
  const { market, sectors, topPicks } = data;
  if (!sectors.length) return <p className="card p-4 text-muted">Chưa đủ dữ liệu để xếp hạng ngành.</p>;

  return (
    <div className="space-y-6">
      {/* Thị trường chung */}
      <section className="card p-4">
        <div className="text-xs text-muted">
          Thị trường chung · {market.count} mã giao dịch sôi động · dữ liệu đến {data.date ?? "—"}
        </div>
        <p className="mt-1 font-medium">{marketVerdict(market.breadth)}</p>
        <div className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span>
            1 tuần <b className={tone(market.ret5)}>{signed(market.ret5)}</b>
          </span>
          <span>
            1 tháng <b className={tone(market.ret20)}>{signed(market.ret20)}</b>
          </span>
          <span>
            Mã đang xu hướng tăng <b>{market.breadth.toFixed(0)}%</b>
          </span>
          <span className={flowText(market.flow).cls}>{flowText(market.flow).text} so với tháng trước</span>
        </div>
      </section>

      {/* Top đáng chú ý */}
      {topPicks.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">⭐ Mã đáng chú ý nhất — thuộc các ngành đang mạnh</h2>
          <p className="mb-3 text-xs text-muted">
            Chỉ đặt mua trong <b>vùng mua</b>. Giá đã chạy cao hơn thì bỏ qua, không đuổi theo.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topPicks.map((p) => (
              <PickCard key={p.ticker} p={p} sector={p.sector ?? undefined} />
            ))}
          </div>
        </section>
      )}

      {/* Bảng xếp hạng ngành */}
      <section>
        <h2 className="mb-1 font-semibold">🏆 Xếp hạng nhóm ngành — tiền đang chảy vào đâu?</h2>
        <p className="mb-3 text-xs text-muted">
          Bấm vào từng ngành để xem mã gợi ý. Ngành đứng đầu = giá tăng tốt + nhiều mã cùng tăng + tiền đổ vào nhiều hơn.
        </p>
        <div className="space-y-2">
          {sectors.map((s, i) => {
            const flow = flowText(s.flow);
            return (
              <details key={s.sector} className="card group" open={i < 2 && !s.lowConfidence}>
                <summary className="grid cursor-pointer list-none grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1 p-3 sm:grid-cols-[1.5rem_minmax(10rem,1fr)_6.5rem_4.5rem_4.5rem_7rem_9rem_auto]">
                  <span className="num text-muted">{s.lowConfidence ? "·" : i + 1}</span>
                  <span className="font-semibold">
                    {s.sector}
                    <span className="ml-1.5 text-[11px] font-normal text-muted">
                      {s.count} mã{s.lowConfidence ? " · ít mã, kém tin cậy" : ""}
                    </span>
                  </span>
                  <span className={`justify-self-end rounded-md border px-2 py-0.5 text-[11px] sm:justify-self-start ${TREND[s.trend].cls}`}>
                    {TREND[s.trend].label}
                  </span>
                  <span className="num col-start-2 text-xs sm:col-start-auto">
                    <span className="text-muted sm:hidden">1 tuần </span>
                    <span className={tone(s.ret5)}>{signed(s.ret5)}</span>
                  </span>
                  <span className="num text-xs">
                    <span className="text-muted sm:hidden">1 tháng </span>
                    <span className={tone(s.ret20)}>{signed(s.ret20)}</span>
                  </span>
                  <span className="col-start-2 flex items-center gap-1.5 text-xs sm:col-start-auto" title="% mã trong ngành đang ở xu hướng tăng">
                    <span className="h-1.5 w-12 overflow-hidden rounded bg-border">
                      <span
                        className={`block h-full ${s.breadth >= 50 ? "bg-gain" : "bg-loss"}`}
                        style={{ width: `${s.breadth}%` }}
                      />
                    </span>
                    <span className="num">{s.breadth.toFixed(0)}% tăng</span>
                  </span>
                  <span className={`num text-xs ${flow.cls}`}>{flow.text}</span>
                  <span className="num hidden text-xs text-muted sm:inline" title="Phần trăm tổng tiền giao dịch toàn thị trường">
                    {s.share.toFixed(1)}% tiền TT
                  </span>
                </summary>
                <div className="border-t border-border p-3">
                  {s.picks.length === 0 ? (
                    <p className="text-xs text-muted">Chưa có mã nào ở điểm mua tốt trong ngành này.</p>
                  ) : (
                    <>
                      {s.trend === "weak" && (
                        <p className="mb-2 text-xs text-loss">
                          ⚠️ Ngành đang yếu — dù mã có điểm mua đẹp, xác suất thành công thấp hơn. Người mới nên bỏ qua.
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {s.picks.slice(0, 3).map((p) => (
                          <PickCard key={p.ticker} p={p} />
                        ))}
                      </div>
                      {s.picks.length > 3 && (
                        <p className="mt-2 text-[11px] text-muted">
                          Còn: {s.picks.slice(3).map((p) => p.ticker).join(", ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* Chú giải */}
      <section className="card p-4 text-xs leading-relaxed text-muted">
        <h3 className="mb-2 font-semibold text-foreground">📖 Đọc bảng này thế nào?</h3>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b className="text-foreground">1 tuần / 1 tháng</b> — giá của mã &quot;điển hình&quot; trong ngành đã tăng/giảm bao nhiêu.
          </li>
          <li>
            <b className="text-foreground">% tăng</b> — bao nhiêu phần trăm số mã trong ngành đang có xu hướng đi lên
            (giá cao hơn mức trung bình ~2,5 tháng). Trên 50% = cả ngành cùng khỏe, không phải chỉ 1–2 mã kéo.
          </li>
          <li>
            <b className="text-foreground">Dòng tiền ×</b> — tiền mua bán tuần này so với trung bình tháng trước.
            ×1,5 = sôi động gấp rưỡi → nhà đầu tư lớn đang chú ý ngành này.
          </li>
          <li>
            <b className="text-foreground">Vùng mua / Cắt lỗ / Chốt lời</b> — mua trong vùng; nếu giá rơi về mức cắt lỗ thì bán
            để giữ vốn; lên tới chốt lời thì bán lấy lãi. Giá hiển thị bằng đồng/cổ phiếu.
          </li>
        </ul>
        <p className="mt-3 text-[11px]">
          ⚠️ Đây là gợi ý kỹ thuật tự động dựa trên giá và khối lượng, chưa xét báo cáo tài chính. Các chiến lược
          chưa được chứng minh có lãi — hãy tập bằng tiền ảo trước.
        </p>
      </section>
    </div>
  );
}
