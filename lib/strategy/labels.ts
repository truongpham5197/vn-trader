/** Nhãn người đọc được. Không đưa mã chiến lược ra màn hình. */
const LABELS: Record<string, string> = {
  "breakout-20": "Vượt đỉnh 20 phiên",
  "pullback-ma20": "Hồi về đường trung bình",
  "rsi2-revert": "Hồi sau giảm mạnh",
};

export function strategyLabel(name: string): string {
  return LABELS[name] ?? name;
}
