import { fetchJson } from "./http";

const BASE = "https://api-finfo.vndirect.com.vn/v4";

export type EventGroup = "dividend" | "meeting" | "issue" | "trade";

export interface CorpEvent {
  ticker: string;
  type: string; // type gốc VNDirect: DIVIDEND | KINDDIV | MEETING | meetingRight | LISTED | nomargin…
  group: EventGroup;
  label: string; // nhãn VN (typeDesc của VNDirect, fallback map nội bộ)
  note: string | null;
  announced: string | null; // ngày công bố
  exDate: string | null; // ngày GDKHQ / ngày họp / ngày hiệu lực
  payDate: string | null; // ngày trả cổ tức / ngày diễn ra
  dividend: number | null; // đ/cp (cổ tức tiền)
  ratio: number | null; // % (tỷ lệ chia/thưởng)
}

const GROUP: Record<string, EventGroup> = {
  DIVIDEND: "dividend",
  STOCKDIV: "dividend",
  KINDDIV: "dividend",
  schedDiv: "dividend",
  MEETING: "meeting",
  meetingRight: "meeting",
  POLL: "meeting",
  ISSUE: "issue",
  schedIssue: "issue",
  LISTED: "issue",
  updateListed: "issue",
  listedHose: "issue",
  listedUpcom: "issue",
  delistedUpcom: "issue",
  lastTradeUpcom: "issue",
  nomargin: "trade",
  suspend: "trade",
  halt: "trade",
  control: "trade",
  alert: "trade",
  noticed: "trade",
};

const LABEL: Record<string, string> = {
  DIVIDEND: "Cổ tức tiền",
  STOCKDIV: "Cổ tức cổ phiếu",
  KINDDIV: "Cổ phiếu thưởng",
  schedDiv: "Dự kiến cổ tức",
  MEETING: "Họp ĐHCĐ",
  meetingRight: "Chốt quyền ĐHCĐ",
  POLL: "Bầu phiếu",
  ISSUE: "Phát hành",
  schedIssue: "Dự kiến phát hành",
  LISTED: "Niêm yết bổ sung",
  updateListed: "Đổi khối lượng niêm yết",
  listedHose: "Niêm yết mới",
  listedUpcom: "Niêm yết mới",
  delistedUpcom: "Hủy niêm yết",
  lastTradeUpcom: "Phiên GD cuối",
  nomargin: "Cắt margin",
  suspend: "Tạm ngừng GD",
  halt: "Đình chỉ GD",
  control: "Đưa vào kiểm soát",
  alert: "Cảnh báo",
  noticed: "Đưa vào cảnh báo",
};

// Sắp tới: bỏ LISTED/updateListed — VNDirect đẩy ngày DKCC đăng ký xa tít (vd 2036)
// → làm nhiễu bảng "sắp diễn ra"
const UPCOMING_TYPES = "DIVIDEND,STOCKDIV,KINDDIV,schedDiv,MEETING,meetingRight,POLL,ISSUE,schedIssue";

interface RawEvent {
  code: string;
  type: string;
  typeDesc?: string;
  note?: string;
  dividend?: number;
  ratio?: number;
  disclosureDate?: string;
  effectiveDate?: string;
  expiredDate?: string;
  actualDate?: string;
}

const toEvent = (x: RawEvent): CorpEvent => ({
  ticker: x.code,
  type: x.type,
  group: GROUP[x.type] ?? "issue",
  label: x.typeDesc?.trim() || LABEL[x.type] || x.type,
  note: x.note?.trim() || null,
  announced: x.disclosureDate ?? null,
  exDate: x.effectiveDate ?? null,
  payDate: x.expiredDate ?? x.actualDate ?? null,
  dividend: x.dividend ?? null,
  ratio: x.ratio ?? null,
});

const FIELDS =
  "fields=code,type,typeDesc,note,dividend,ratio,disclosureDate,effectiveDate,expiredDate,actualDate";

/** "1.500đ/cp — Trả cổ tức đợt 2/2026", "tỷ lệ 10% — Cổ phiếu thưởng" — chi tiết hiển thị. */
export const eventDetail = (e: CorpEvent) =>
  [
    e.dividend !== null
      ? `${e.dividend.toLocaleString("vi-VN")}đ/cp`
      : e.ratio !== null && e.group === "dividend"
        ? `tỷ lệ ${e.ratio}%`
        : null,
    e.note,
  ]
    .filter(Boolean)
    .join(" — ");

/** Sự kiện doanh nghiệp (GDKHQ, cổ tức, ĐHCĐ, phát hành, chế tài GD) — VNDirect finfo. */
export async function fetchEvents(ticker?: string): Promise<CorpEvent[]> {
  const url = ticker
    ? `${BASE}/events?q=code:${ticker.toUpperCase()}~locale:VN&sort=effectiveDate:desc&size=100&${FIELDS}`
    : `${BASE}/events?q=locale:VN&sort=disclosureDate:desc&size=250&${FIELDS}`;
  const [main, upcoming] = await Promise.all([
    fetchJson<{ data: RawEvent[] }>(url, 1).catch(() => null),
    // Không lọc mã → kéo thêm nhóm sự kiện "có ngày" sort theo exDate desc để lấy sự kiện
    // tương lai đã công bố từ lâu (tin mới nhất không đủ phủ GDKHQ sắp tới)
    ticker
      ? null
      : fetchJson<{ data: RawEvent[] }>(
          `${BASE}/events?q=type:${UPCOMING_TYPES}~locale:VN&sort=effectiveDate:desc&size=200&${FIELDS}`,
          1,
        ).catch(() => null),
  ]);
  const seen = new Set<string>();
  const out: CorpEvent[] = [];
  for (const x of [...(main?.data ?? []), ...(upcoming?.data ?? [])]) {
    const e = toEvent(x);
    const key = `${e.ticker}|${e.type}|${e.exDate}|${e.dividend ?? e.ratio ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
