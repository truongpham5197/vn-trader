"use client";

import { useState } from "react";
import { useApi } from "./ui";

const input =
  "num rounded border border-border bg-background px-2 py-1.5 text-foreground focus:border-accent focus:outline-none";

function Toggle({
  on,
  label,
  onText,
  offText,
  danger,
  onChange,
}: {
  on: boolean;
  label: string;
  onText: string;
  offText: string;
  danger?: boolean;
  onChange: (v: boolean) => void;
}) {
  const cls = on
    ? danger
      ? "border-loss/50 bg-loss/15 text-loss"
      : "border-gain/50 bg-gain/15 text-gain"
    : "border-border text-muted";
  return (
    <div className="flex flex-col gap-1 text-muted">
      {label}
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`rounded border px-3 py-1.5 text-left ${cls}`}
      >
        {on ? onText : offText}
      </button>
    </div>
  );
}

export default function SettingsPanel(p: {
  nav: number;
  riskPct: number;
  universe: string;
  minValue: number;
  scanEnabled: boolean;
  learnEnabled: boolean;
  kill: boolean;
  paper: boolean;
  owner: boolean;
  username: string;
}) {
  const { call } = useApi();
  const [navV, setNavV] = useState(String(p.nav / 1e6));
  const [riskV, setRiskV] = useState(String(+(p.riskPct * 100).toFixed(2)));
  const [minV, setMinV] = useState(String(p.minValue / 1e9));
  // Ô số: chỉ lưu khi giá trị thực sự đổi (tránh toast mỗi lần bấm ra ngoài)
  const saved: Record<string, string> = {
    navVnd: String(p.nav),
    riskPct: String(p.riskPct),
    universeMinValueVnd: String(p.minValue),
  };
  const save = (key: string, value: string) =>
    (key in saved && Number(saved[key]) === Number(value)) ||
    call("POST", "/api/settings", { key, value }, "Đã lưu cấu hình");

  return (
    <div className="card p-3">
      <div className="text-xs text-muted">
        Lưu ngay khi sửa (bấm ra ngoài ô). Vốn + rủi ro là của riêng{" "}
        <b className="text-foreground">{p.username}</b>.{" "}
        {p.owner
          ? "Đổi Kill switch / Quét tín hiệu / Tự học sẽ báo Telegram."
          : "Mục hệ thống (quét, kill switch, danh sách quét) chỉ chủ app đổi được."}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
        <fieldset disabled={!p.owner} className="contents">
          <Toggle
            label="Quét tín hiệu"
            on={p.scanEnabled}
            onText="▶️ Đang chạy"
            offText="⏸ Đang tắt"
            onChange={(v) => save("scanEnabled", String(v))}
          />
          <div title="App tự đổi tham số chiến lược theo kết quả gợi ý + kiểm chứng backtest tuần. Tắt = giữ nguyên tham số hiện tại, vẫn quét bình thường.">
            <Toggle
              label="Tự học chiến lược"
              on={p.learnEnabled}
              onText="🧠 Đang học"
              offText="⏸ Đang tắt"
              onChange={(v) => save("learnEnabled", String(v))}
            />
          </div>
          <Toggle
            label="Kill switch"
            danger
            on={p.kill}
            onText="🛑 BẬT — chặn mọi lệnh"
            offText="Tắt"
            onChange={(v) => {
              const q = v
                ? "Bật kill switch? Scanner dừng và mọi lệnh bị chặn."
                : "Tắt kill switch? Hệ thống sẽ được phép đặt lệnh trở lại.";
              if (confirm(q)) save("killSwitch", String(v));
            }}
          />
        </fieldset>
        <label className="flex flex-col gap-1 text-muted">
          Vốn ban đầu (triệu đ)
          <input
            value={navV}
            inputMode="decimal"
            onChange={(e) => setNavV(e.target.value)}
            onBlur={() => save("navVnd", String(Number(navV) * 1e6))}
            className={`${input} w-28`}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-muted"
          title="Mỗi lệnh chấp nhận lỗ tối đa bao nhiêu % vốn nếu chạm cắt lỗ. Nên 0,5–1%."
        >
          Rủi ro mỗi lệnh (% vốn, ≤3)
          <input
            value={riskV}
            inputMode="decimal"
            onChange={(e) => setRiskV(e.target.value)}
            onBlur={() =>
              save("riskPct", String(Number(riskV.replace(",", ".")) / 100))
            }
            className={`${input} w-20`}
          />
        </label>
        <fieldset disabled={!p.owner} className="contents">
          <label className="flex flex-col gap-1 text-muted">
            Danh sách quét
            <select
              defaultValue={p.universe}
              onChange={(e) => save("universe", e.target.value)}
              className="rounded border border-border bg-card px-2 py-1.5 text-foreground focus:border-accent focus:outline-none"
            >
              <option value="vn30">VN30 (30 mã lớn)</option>
              <option value="liquid">Mã giao dịch sôi động</option>
              <option value="all">Toàn thị trường</option>
            </select>
          </label>
          <label
            className="flex flex-col gap-1 text-muted"
            title="Chỉ xét mã có giá trị giao dịch trung bình/ngày từ mức này trở lên"
          >
            GTGD tối thiểu (tỷ đ/ngày)
            <input
              value={minV}
              inputMode="decimal"
              onChange={(e) => setMinV(e.target.value)}
              onBlur={() =>
                save("universeMinValueVnd", String(Number(minV) * 1e9))
              }
              className={`${input} w-20`}
            />
          </label>
        </fieldset>
        <div
          className="flex flex-col gap-1 text-muted"
          title="Chỉ đổi được qua biến môi trường PAPER_TRADING — quy tắc an toàn"
        >
          Chế độ
          <span
            className={`rounded border px-3 py-1.5 ${p.paper ? "border-border" : "border-loss/50 text-loss"}`}
          >
            {p.paper ? "📝 Tiền ảo (paper)" : "💸 TIỀN THẬT"}
          </span>
        </div>
      </div>
    </div>
  );
}
