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
    symbol: { ticker: string };
    strategy: { name: string };
  }[];
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-neutral-800 text-left text-neutral-500">
          <th className="p-2">Ngày</th>
          <th className="p-2">Mã</th>
          <th className="p-2">Chiến lược</th>
          <th className="p-2 text-right">Entry</th>
          <th className="p-2 text-right">Stop</th>
          <th className="p-2 text-right">Target</th>
          <th className="p-2 text-right">Qty</th>
          <th className="p-2 text-right">R:R</th>
          <th className="p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s) => (
          <tr key={s.id} className="border-b border-neutral-900">
            <td className="p-2 text-neutral-500">{s.date}</td>
            <td className="p-2 font-bold">{s.symbol.ticker}</td>
            <td className="p-2">{s.strategy.name}</td>
            <td className="p-2 text-right">{s.entry.toFixed(2)}</td>
            <td className="p-2 text-right text-red-400">{s.stop.toFixed(2)}</td>
            <td className="p-2 text-right text-emerald-400">{s.target.toFixed(2)}</td>
            <td className="p-2 text-right">{s.qty}</td>
            <td className="p-2 text-right">{s.rr}</td>
            <td className="p-2">{s.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
