"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Modal, toast } from "./ui";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Chrome/Edge/Android bắn beforeinstallprompt 1 lần sau khi tải trang — giữ lại để bấm nút mới hiện hộp cài
let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => ((deferred = null), emit()));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** "prompt" = có hộp cài của trình duyệt, "ios" = hướng dẫn Chia sẻ → Thêm vào MH chính, null = đã cài / không hỗ trợ. */
function useInstall() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => (standalone() ? null : deferred ? "prompt" : isIos() ? "ios" : null),
    () => null,
  );
}

async function install(setIos: (v: boolean) => void, mode: "prompt" | "ios") {
  if (mode === "ios" || !deferred) return setIos(true);
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  if (outcome === "accepted") toast("Đã cài VN Trader — mở từ màn hình chính");
}

function IosHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Cài VN Trader lên iPhone/iPad" onClose={onClose}>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Mở trang này bằng <b>Safari</b>.
        </li>
        <li>
          Bấm nút <b>Chia sẻ</b> <span className="text-muted">(ô vuông có mũi tên ↑ ở thanh dưới)</span>.
        </li>
        <li>
          Chọn <b>“Thêm vào MH chính”</b> → <b>Thêm</b>.
        </li>
        <li>Mở VN Trader từ biểu tượng trên màn hình chính, vào Cài đặt → Thông báo để bật thông báo đẩy (iOS 16.4+).</li>
      </ol>
    </Modal>
  );
}

/** Đăng ký service worker ngay khi mở web — trình duyệt cần có mới cho cài app (PWA). */
export function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
}

/** Nút 📲 trên menu — chỉ hiện khi cài được và chưa cài. */
export function InstallButton() {
  useServiceWorker();
  const mode = useInstall();
  const [ios, setIos] = useState(false);
  if (!mode) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void install(setIos, mode)}
        className="shrink-0 rounded-md border border-accent/50 px-2 py-1 text-xs text-accent hover:bg-accent/10"
        title="Cài app VN Trader lên máy"
      >
        📲<span className="hidden min-[420px]:inline"> Cài app</span>
      </button>
      <IosHelp open={ios} onClose={() => setIos(false)} />
    </>
  );
}

/** Mục trong /settings — luôn hiện, giải thích theo từng trường hợp. */
export function InstallCard() {
  const mode = useInstall();
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => void Promise.resolve().then(() => setInstalled(standalone())), []);
  return (
    <div className="card flex flex-wrap items-center gap-3 p-4 text-xs">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Cài VN Trader như app trên điện thoại / máy tính</div>
        <p className="mt-0.5 text-muted">
          {installed
            ? "Đang chạy dạng app — đã cài."
            : mode
              ? "Mở nhanh từ màn hình chính, toàn màn hình, nhận thông báo đẩy (iPhone bắt buộc cài mới có)."
              : "Trình duyệt chưa cho cài từ nút này — Android: menu ⋮ → “Cài đặt ứng dụng”/“Thêm vào màn hình chính”; máy tính Chrome/Edge: biểu tượng cài ở thanh địa chỉ; iPhone: Safari → Chia sẻ → “Thêm vào MH chính”."}
        </p>
      </div>
      {mode && (
        <Button tone="primary" size="sm" onClick={() => void install(setIos, mode)}>
          Cài app
        </Button>
      )}
      <IosHelp open={ios} onClose={() => setIos(false)} />
    </div>
  );
}
