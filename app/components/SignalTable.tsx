const STATUS_STYLE: Record<string, string> = {
  new: "text-accent",
  notified: "text-muted",
  taken: "text-gain",
  filled: "text-gain",
  ordered: "text-gain",
  skipped: "text-muted line-through",
  expired: "text-muted",
};

export default function SignalTable({
  signals,
}: {
  signals: {
    id: number;
    date: string;
    entry: number;
    stop: number;
    target: number;
    qty: number;
    rr: number;
    status: string;
    reason: string | null;
    symbol: { ticker: string; sector?: string | null };
    strategy: { name: string };
  }[];
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="p-3 font-medium">Ngày</th>
            <th className="p-3 font-medium">Mã</th>
            <th className="p-3 font-medium">Ngành</th>
            <th className="p-3 font-medium">Chiến lược</th>
            <th className="p-3 text-right font-medium">Entry</th>
            <th className="p-3 text-right font-medium">Stop</th>
            <th className="p-3 text-right font-medium">Target</th>
            <th className="p-3 text-right font-medium">Qty</th>
            <th className="p-3 text-right font-medium">R:R</th>
            <th className="p-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const up = ((s.target - s.entry) / s.entry) * 100;
            return (
              <tr
                key={s.id}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className="num p-3 text-muted">{s.date}</td>
                <td className="p-3 font-semibold">{s.symbol.ticker}</td>
                <td className="p-3 text-muted">{s.symbol.sector ?? "—"}</td>
                <td className="p-3 text-muted">{s.strategy.name}</td>
                <td className="num p-3 text-right">{s.entry.toFixed(2)}</td>
                <td className="num p-3 text-right text-loss">{s.stop.toFixed(2)}</td>
                <td className="num p-3 text-right text-gain">
                  {s.target.toFixed(2)} <span className="text-muted">+{up.toFixed(1)}%</span>
                </td>
                <td className="num p-3 text-right">{s.qty.toLocaleString("en-US")}</td>
                <td className="num p-3 text-right">{s.rr.toFixed(1)}</td>
                <td className={`p-3 ${STATUS_STYLE[s.status] ?? ""}`}>{s.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
