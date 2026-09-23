/** Một câu cho người mới — không phải lời hứa, không phải lý do để tự chỉnh luật. */
export function plainBacktestVerdict(
  m: {
    totalReturnPct: number;
    maxDrawdownPct: number;
    trades: number;
    benchmarkReturnPct?: number | null;
  },
  strategy: string,
  legacy = false,
): { line: string; tone: "gain" | "loss" | "neutral" } {
  if (legacy) {
    return {
      line: `Lần chạy «${strategy}» dùng máy tính cũ — số không đáng tin. Chạy lại nếu muốn xem, đừng sửa luật theo số đó.`,
      tone: "neutral",
    };
  }
  if (!m.trades) {
    return {
      line: `Giả lập «${strategy}» không ra lệnh nào. Chưa kết luận được — đừng sửa luật cho có lệnh.`,
      tone: "neutral",
    };
  }
  const sign = m.totalReturnPct >= 0 ? "lãi" : "lỗ";
  const bench =
    m.benchmarkReturnPct == null
      ? ""
      : ` Mua giữ cùng nhóm mã, không theo tín hiệu: ${m.benchmarkReturnPct >= 0 ? "+" : ""}${m.benchmarkReturnPct.toFixed(1)}%.`;
  return {
    line: `Giả lập «${strategy}» trên dữ liệu cũ: ${sign} ${Math.abs(m.totalReturnPct).toFixed(1)}% (${m.trades} lệnh), lúc tệ nhất tài khoản tụt ${m.maxDrawdownPct.toFixed(1)}%.${bench} Không tự sửa luật theo số này — chỉnh cho vừa quá khứ dễ làm lần sau tệ hơn.`,
    tone: m.totalReturnPct >= 0 ? "gain" : "loss",
  };
}
