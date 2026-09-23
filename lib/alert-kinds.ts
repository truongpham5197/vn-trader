// Dùng chung server + client (không import prisma).
export const ALERT_KINDS = {
  signal: "Tín hiệu mua mới",
  sector: "Cơ hội trong phiên (mã vào vùng mua, ngành dẫn đầu)",
  stop: "Chạm cắt lỗ",
  target: "Chạm chốt lời",
  positions: "Báo cáo vị thế định kỳ",
  system: "Hệ thống (kill switch, GDKHQ, lệnh TCBS)",
} as const;
export type AlertKind = keyof typeof ALERT_KINDS;
export type AlertLevel = "info" | "success" | "warn" | "danger";

/** Gắn vào sendTelegram để ghi thêm thông báo web. userId: bỏ trống = owner, null = mọi người. */
export interface WebAlert {
  kind: AlertKind;
  level?: AlertLevel;
  ticker?: string;
  userId?: number | null;
}

export interface AlertItem {
  id: number;
  at: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  body: string;
  ticker: string | null;
}

/** Loại mặc định cho Telegram riêng + thông báo đẩy (khớp default ở schema User.alertKinds). */
export const DEFAULT_PUSH_KINDS: AlertKind[] = ["signal", "sector", "stop", "target", "system"];

/** Trang liên quan tới thông báo — dùng chung chuông web + thông báo đẩy. */
export const alertHref = (a: { kind: AlertKind | string; ticker: string | null }) =>
  a.ticker ? `/stock/${a.ticker}` : a.kind === "signal" ? "/signals" : a.kind === "sector" ? "/sectors" : a.kind === "system" ? "/settings" : "/journal";
