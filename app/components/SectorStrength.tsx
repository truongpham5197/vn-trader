import Link from "next/link";
import { liveTime, type SectorStrength as Data, type SectorTrend } from "@/lib/analysis/sector-strength";
import PickCard from "./PickCard";
import { LiveBadge, PinQuotes } from "./live";

const TREND: Record<SectorTrend, { label: string; cls: string }> = {
  lead: { label: "🚀 Dẫn đầu", cls: "border-gain/40 bg-gain/15 text-gain" },
  strong: { label: "📈 Mạnh", cls: "border-gain/30 bg-gain/5 text-gain" },
  neutral: { label: "➖ Đi ngang", cls: "border-border text-muted" },
  weak: { label: "📉 Yếu", cls: "border-loss/30 bg-loss/5 text-loss" },
};

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const tone = (v: number) => (v >= 0 ? "text-gain" : "text-loss");

function marketVerdict(breadth: number): string {
  if (breadth >= 60) return "Thị trường thuận lợi — đa số cổ phiếu đang trong xu hướng tăng.";
  if (breadth >= 40) return "Thị trường giằng co — chỉ nên mua ở các ngành mạnh, mua ít.";
  return "Thị trường yếu — đa số cổ phiếu đang giảm, ưu tiên đứng ngoài quan sát.";
}

function flowText(f: number): { text: string; cls: string } {
  if (f >= 1.3) return { text: `GTGD tăng ×${f.toFixed(1)}`, cls: "text-gain" };
  if (f >= 1.05) return { text: `GTGD ×${f.toFixed(2)}`, cls: "text-gain" };
  if (f > 0.9) return { text: `Bình thường ×${f.toFixed(2)}`, cls: "text-muted" };
  return { text: `GTGD giảm ×${f.toFixed(2)}`, cls: "text-loss" };
}

export default function SectorStrength({ data }: { data: Data }) {
  const { market, sectors, topPicks } = data;
  if (!sectors.length) return <p className="card p-4 text-muted">Chưa đủ dữ liệu để xếp hạng ngành.</p>;

  const pickTickers = [
    ...new Set([
      ...topPicks.map((p) => p.ticker),
      ...sectors.flatMap((s) => s.picks.map((p) => p.ticker)),
    ]),
  ];
  return (
    <div className="space-y-6">
      <PinQuotes tickers={pickTickers} />
      {/* Thị trường chung */}
      <section className="card p-4">
        <div className="text-xs text-muted">
          Thị trường chung · {market.count} mã giao dịch sôi động ·{" "}
          {data.live ? (
            <span className="text-accent">
              ⚡ xếp hạng theo giá trong phiên {liveTime(data.live.at)} — tính lại 5 phút/lần
            </span>
          ) : (
            <>dữ liệu cuối ngày {data.date ?? "—"}</>
          )}
        </div>
        <p className="mt-1 font-medium">{marketVerdict(market.breadth)}</p>
        <p className="mt-1 text-xs text-muted">Bối cảnh theo quy tắc độ rộng, không phải dự báo. Ngưỡng lọc chưa chứng minh cải thiện lợi nhuận.</p>
        {data.coverage && <p className="mt-1 text-xs text-muted">Độ phủ cùng phiên: {data.coverage.included}/{data.coverage.total} mã. Không trộn nến cũ vào xếp hạng mới.</p>}
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
          <h2 className="mb-1 font-semibold">⭐ Setup để theo dõi — chưa xác nhận mua</h2>
          <p className="mb-3 text-xs text-muted">
            Nằm trong vùng giá chưa đủ để mua. Chờ scanner xác nhận bằng nến đóng cửa và kiểm tra kế hoạch rủi ro riêng.
            Nến trong phiên còn thay đổi. <LiveBadge />
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topPicks.map((p) => (
              <PickCard key={p.ticker} p={p} sector={p.sector ?? undefined} />
            ))}
          </div>
        </section>
      )}

      {/* Bảng xếp hạng ngành */}
      {!topPicks.length && <p className="card p-4 text-muted">Không có setup đạt bộ lọc hiện tại. Không bổ sung mã để đủ top; ưu tiên quan sát.</p>}
      <section>
        <h2 className="mb-1 font-semibold">🏆 Xếp hạng sức mạnh và hoạt động giao dịch ngành</h2>
        <p className="mb-3 text-xs text-muted">
          Bấm vào ngành để xem setup. Xếp hạng tương đối theo giá, độ rộng và GTGD; ngành đứng đầu vẫn có thể giảm.
        </p>
        <div className="space-y-2">
          {sectors.map((s, i) => {
            const flow = flowText(s.flow);
            return (
              <details key={s.sector} className="card group" open={i < 2 && !s.lowConfidence}>
                <summary className="grid cursor-pointer list-none grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1 p-3 sm:grid-cols-[1.5rem_minmax(10rem,1fr)_6.5rem_4.5rem_4.5rem_7rem_9rem_auto]">
                  <span className="num text-muted">{s.lowConfidence ? "·" : i + 1}</span>
                  <span className="min-w-0 font-semibold">
                    {s.sector}
                    <span className="ml-1.5 text-xs font-normal text-muted">
                      {s.count} mã{s.lowConfidence ? " · ít mã, kém tin cậy" : ""}
                    </span>
                    <span className="block text-xs font-normal text-muted">{s.summary}</span>
                  </span>
                  <span className={`justify-self-end rounded-md border px-2 py-0.5 text-xs sm:justify-self-start ${TREND[s.trend].cls}`}>
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
                  <div className="mb-3 text-xs">
                    <div className="mb-1 font-semibold">Vì sao ngành xếp hạng này?</div>
                    <ul className="list-disc space-y-0.5 pl-4 leading-relaxed text-muted">
                      {s.why.map((w, j) => (
                        <li key={j}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  {s.picks.length === 0 ? (
                    <p className="text-xs text-muted">Chưa có mã nào ở điểm mua tốt trong ngành này.</p>
                  ) : (
                    <>
                      {s.trend === "weak" && (
                        <p className="mb-2 text-xs text-loss">
                          ⚠️ Ngành đang yếu — bộ lọc thận trọng không ưu tiên mở mới. Chưa có số liệu để suy ra xác suất thắng.
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {s.picks.slice(0, 3).map((p) => (
                          <PickCard key={p.ticker} p={p} />
                        ))}
                      </div>
                      {s.picks.length > 3 && (
                        <p className="mt-2 text-xs text-muted">
                          Còn:{" "}
                          {s.picks.slice(3).map((p, j) => (
                            <span key={p.ticker}>
                              {j > 0 && ", "}
                              <Link href={`/stock/${p.ticker}`} className="text-foreground hover:text-accent" title={p.plain}>
                                {p.ticker}
                              </Link>{" "}
                              <span className="text-muted">({p.setup})</span>
                            </span>
                          ))}
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
            <b className="text-foreground">GTGD ×</b> — giá trị giao dịch ước tính tuần này so với trung bình trước đó.
            Không phải dòng tiền ròng hay bằng chứng nhà đầu tư lớn mua vào; trong phiên là ngoại suy theo thời gian, có thể sai lệch.
          </li>
          <li>
            <b className="text-foreground">Vùng theo dõi / Mốc vô hiệu / Mục tiêu mô hình</b> — kịch bản quan sát, không phải lệnh mua
            hay dự báo. Stop không bảo đảm khớp đúng giá, đặc biệt khi chưa đủ T+2 hoặc mất thanh khoản.
          </li>
        </ul>
        <p className="mt-3 text-xs">
          ⚠️ Đây là gợi ý kỹ thuật tự động dựa trên giá và khối lượng; phần kinh doanh trên thẻ chỉ để tham khảo. Các chiến lược
          chưa được chứng minh có lãi — hãy tập bằng tiền ảo trước.
        </p>
      </section>
    </div>
  );
}
