"use client";

import { useEffect, useState } from "react";
import { ALERT_KINDS, type AlertKind } from "@/lib/alert-kinds";
import { Button, toast } from "./ui";
import { useVoice } from "./VoiceProvider";

type Persona = { id: string; name: string; emoji: string; sample: string; shared: number };
type Me = { owner: boolean; alertKinds: string[]; telegramLinked: boolean; persona: string | null; variant: number; personas: Persona[] };

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** base64url → Uint8Array cho applicationServerKey. */
function keyBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Gọi khi mở web: thiết bị đã bật thông báo đẩy → gắn lại với user đang chọn (đổi tên người dùng). */
export async function resyncPush(username: string) {
  if (!username || !pushSupported() || Notification.permission !== "granted") return;
  try {
    const key = `vt_push_sync:${username}`;
    if (sessionStorage.getItem(key)) return;
    const sub = await currentSub();
    if (sub && (await fetch("/api/push", json("POST", sub.toJSON()))).ok) sessionStorage.setItem(key, "1");
  } catch {}
}

/** Mục trong /settings: thông báo đẩy về thiết bị + Telegram riêng, lọc theo loại (lưu theo tài khoản). */
export default function PushSettings({ username }: { username: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [on, setOn] = useState(false);
  const [perm, setPerm] = useState("default");
  const [busy, setBusy] = useState(false);
  const { setVoice } = useVoice();
  const [link, setLink] = useState<{ code: string; bot: string | null; url: string | null } | null>(null);

  useEffect(() => {
    if (!username) return;
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe);
    if (!pushSupported()) return void Promise.resolve().then(() => setPerm("unsupported"));
    void currentSub().then((s) => (setPerm(Notification.permission), setOn(!!s)));
  }, [username]);

  // Đang chờ user bấm Start trong Telegram → hỏi lại mỗi 3s, tối đa 2 phút
  useEffect(() => {
    if (!link) return;
    let n = 0;
    const t = setInterval(async () => {
      const r = await fetch("/api/me").catch(() => null);
      const m = r?.ok ? ((await r.json()) as Me) : null;
      if (m?.telegramLinked) {
        setMe(m);
        setLink(null);
        toast("Đã kết nối Telegram");
      } else if (++n > 40) setLink(null);
    }, 3000);
    return () => clearInterval(t);
  }, [link]);

  if (!username) return <div className="card p-4 text-xs text-muted">Chọn hoặc tạo tên người dùng ở góc trên để bật thông báo đẩy / Telegram riêng.</div>;

  const togglePush = async () => {
    setBusy(true);
    try {
      if (on) {
        const sub = await currentSub();
        if (sub) {
          await fetch("/api/push", json("DELETE", { endpoint: sub.endpoint }));
          await sub.unsubscribe();
        }
        setOn(false);
        toast("Đã tắt thông báo đẩy trên thiết bị này");
        return;
      }
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") return toast("Trình duyệt chưa cho phép thông báo", false);
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/push")).json()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const r = await fetch("/api/push", json("POST", sub.toJSON()));
      if (!r.ok) return toast((await r.json().catch(() => null))?.error ?? `Lỗi ${r.status}`, false);
      setOn(true);
      toast("Đã bật thông báo đẩy trên thiết bị này");
    } catch (e) {
      toast(`Không bật được: ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  };

  const testPush = async () => {
    setBusy(true);
    try {
      // Gắn lại subscription của thiết bị này với user hiện tại trước (đổi tên / sub cũ bị xóa)
      const sub = await currentSub();
      if (!sub) return (setOn(false), toast("Thiết bị này chưa đăng ký — bấm Bật lại", false));
      await fetch("/api/push", json("POST", sub.toJSON()));
      const r = await fetch("/api/push/test", json("POST"));
      const j = await r.json();
      if (!r.ok) return toast(j.error ?? `Lỗi ${r.status}`, false);
      toast(
        j.ok
          ? `Đã gửi tới ${j.ok}/${j.total} thiết bị — không thấy thông báo thì kiểm tra cài đặt thông báo của điện thoại (chế độ không làm phiền, tiết kiệm pin)`
          : "Dịch vụ push từ chối — bấm Tắt rồi Bật lại",
        j.ok > 0,
      );
    } catch (e) {
      toast(`Lỗi: ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  };

  const setKinds = async (k: AlertKind) => {
    if (!me) return;
    const kinds = me.alertKinds.includes(k) ? me.alertKinds.filter((x) => x !== k) : [...me.alertKinds, k];
    setMe({ ...me, alertKinds: kinds });
    const r = await fetch("/api/me", json("PATCH", { alertKinds: kinds }));
    if (r.ok) setMe((await r.json()) as Me);
    else toast("Lưu thất bại", false);
  };

  const setPersona = async (id: string) => {
    const r = await fetch("/api/me", json("PATCH", { persona: id }));
    const j = await r.json();
    if (!r.ok) return toast(j.error ?? "Lưu thất bại", false);
    setMe(j as Me);
    setVoice({ persona: j.persona, variant: j.variant });
    toast("Đã đổi giọng — lời khuyên trên web và thông báo đổi theo");
  };

  const connect = async () => {
    const r = await fetch("/api/telegram/link", json("POST"));
    const j = await r.json();
    if (!r.ok) return toast(j.error ?? `Lỗi ${r.status}`, false);
    setLink(j);
    if (j.url) window.open(j.url, "_blank", "noopener");
  };
  const disconnect = async () => {
    if ((await fetch("/api/telegram/link", json("DELETE"))).ok && me) setMe({ ...me, telegramLinked: false });
  };

  return (
    <div className="card p-4 text-xs">
      <div className="font-medium">Loại được đẩy về điện thoại / Telegram</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(ALERT_KINDS) as AlertKind[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" disabled={!me} checked={me?.alertKinds.includes(k) ?? false} onChange={() => void setKinds(k)} className="accent-[var(--color-accent)]" />
            {ALERT_KINDS[k]}
          </label>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <div className="font-medium">🎭 Giọng thông báo của bạn</div>
        <p className="mt-1 text-muted">Chọn thoải mái, trùng người khác cũng được — mỗi người trong cùng phong cách có câu chữ riêng, không ai nhận tin giống ai. Lời khuyên, giải thích trên web và thông báo đều đổi theo giọng này — chỉ đổi cách nói, số liệu vẫn y như nhau.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {me?.personas.map((p) => {
            const mine = me.persona === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={mine}
                onClick={() => void setPersona(p.id)}
                className={`rounded border p-2 text-left ${mine ? "border-[var(--color-accent)]" : "border-border"}`}
              >
                <div className="font-medium">
                  {p.emoji} {p.name} {mine ? "· đang dùng" : ""}
                  {p.shared > 0 && <span className="font-normal text-muted"> · {p.shared} người khác cũng dùng</span>}
                </div>
                <div className="mt-1 text-muted">“{p.sample}”</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="font-medium">📲 Thông báo đẩy trên thiết bị này:</span>
        {perm === "unsupported" ? (
          <span className="text-muted">
            {isIos() && !standalone() ? "iPhone/iPad: bấm Chia sẻ → “Thêm vào MH chính”, mở VN Trader từ màn hình chính rồi bật ở đây (iOS 16.4+)." : "Trình duyệt này không hỗ trợ."}
          </span>
        ) : (
          <>
            <Button size="sm" tone={on ? "danger" : "primary"} disabled={busy || perm === "denied"} onClick={() => void togglePush()}>
              {on ? "Tắt" : "Bật"}
            </Button>
            <span className={on ? "text-gain" : "text-muted"}>{on ? "đang bật" : "đang tắt"}</span>
            {on && (
              <Button size="sm" disabled={busy} onClick={() => void testPush()}>
                🔔 Gửi thử
              </Button>
            )}
            {perm === "denied" && <span className="text-loss">— trình duyệt đang chặn, mở lại quyền thông báo cho trang này</span>}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="font-medium">✈️ Telegram riêng:</span>
        {!me ? (
          <span className="text-muted">…</span>
        ) : me.owner ? (
          <span className="text-muted">Chủ app nhận qua bot chính (TELEGRAM_CHAT_ID) — đủ mọi loại, không lọc ở đây.</span>
        ) : me.telegramLinked ? (
          <>
            <span className="text-gain">đã kết nối</span>
            <Button size="sm" tone="danger" onClick={() => void disconnect()}>
              Ngắt kết nối
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" tone="primary" onClick={() => void connect()}>
              Kết nối Telegram
            </Button>
            {link && (
              <span className="text-muted">
                {link.url ? (
                  <>
                    Bấm <b>Start</b> trong Telegram (
                    <a href={link.url} target="_blank" rel="noopener" className="text-accent hover:underline">
                      mở lại link
                    </a>
                    ) — đang chờ…
                  </>
                ) : (
                  <>
                    Mở bot rồi gửi: <code className="text-foreground">/start {link.code}</code> — đang chờ…
                  </>
                )}
              </span>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-muted">
        Thông báo đẩy hiện khi web đang đóng hoặc chạy nền (đang mở web thì hiện nổi trong trang); Android/máy tính dùng được ngay, iPhone cần thêm vào màn hình
        chính. Chỉ gửi khi có sự kiện thuộc loại đã tick ở trên — tín hiệu mua ra sau khi chốt dữ liệu phiên (khoảng 15h30–17h), cơ hội trong phiên 9h–15h; muốn nhận báo cáo vị thế mỗi
        30 phút thì tick “Báo cáo vị thế định kỳ”. Tín hiệu mua gửi cho mọi người; cắt lỗ/chốt lời chỉ gửi cho chủ vị thế. Tín hiệu dựa trên giá + khối lượng, chỉ để tham khảo — không phải khuyến nghị.
      </p>
    </div>
  );
}
