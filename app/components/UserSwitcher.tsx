"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Modal, inputCls, useApi } from "./ui";
import { navigationAfterSessionChange } from "@/lib/nav";

type U = { username: string; owner: boolean; hasPin: boolean; open: number };
/** Bước nhập PIN: set = tạo mới (nhập 2 lần), enter = nhập PIN đã có. */
type Step = { username: string; mode: "set" | "enter"; create: boolean };

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function PinInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <Field label={label}>
      <input
        className={`${inputCls} text-center text-lg tracking-[0.5em]`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{6}"
        maxLength={6}
        placeholder="••••••"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(digits(e.target.value))}
      />
    </Field>
  );
}

/** Chọn/tạo tên người dùng + mã PIN 6 số — đúng PIN 1 lần thì thiết bị này nhớ (cookie 1 năm). */
export default function UserSwitcher({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<U[] | null>(null);
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [change, setChange] = useState(false);
  const { call, busy } = useApi();
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!username && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [username]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open]);

  const reset = () => (setStep(null), setPin(""), setPin2(""), setChange(false));
  const close = () => (setOpen(false), reset(), setName(""));
  const choose = (u: U) => (u.username === username ? close() : (setStep({ username: u.username, mode: u.hasPin ? "enter" : "set", create: false }), setPin(""), setPin2("")));

  const pinOk = pin.length === 6 && (step?.mode !== "set" || pin === pin2);
  const submitPin = async () => {
    if (!step || !pinOk) return;
    const ok = await call(
      "POST",
      "/api/users",
      { username: step.username, create: step.create, pin },
      step.mode === "set" ? `Đã tạo mã PIN — đang dùng tên ${step.username}` : `Đang dùng tên ${step.username}`,
      { reload: navigationAfterSessionChange() === "reload" },
    );
    if (ok) close();
    else setPin("");
  };
  const changePin = async () => {
    if (pin2.length !== 6 || pin.length !== 6) return;
    if (await call("PATCH", "/api/users", { pin, newPin: pin2 }, "Đã đổi mã PIN — thiết bị khác phải nhập lại", { reload: navigationAfterSessionChange() === "reload" })) close();
    else setPin("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-24 shrink-0 truncate rounded-md border sm:max-w-32 border-border px-2 py-1 text-xs text-muted hover:text-foreground"
        title="Đổi người dùng"
      >
        👤 {username ?? "Chọn tên"}
      </button>
      <Modal open={open} title={step ? `🔒 ${step.username}` : change ? "Đổi mã PIN" : "Bạn là ai?"} onClose={close}>
        {step ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPin();
            }}
            className="flex flex-col gap-3 text-sm"
          >
            <p className="text-xs text-muted">
              {step.mode === "set"
                ? step.create
                  ? "Tạo mã PIN 6 số để bảo vệ trang cá nhân của tên này."
                  : "Tên này chưa có mã PIN — tạo ngay để người khác không vào được vị thế, nhật ký, vốn của bạn."
                : "Nhập mã PIN 6 số. Thiết bị này sẽ nhớ, lần sau không hỏi lại."}
            </p>
            <PinInput value={pin} onChange={setPin} label={step.mode === "set" ? "Mã PIN mới" : "Mã PIN"} autoFocus />
            {step.mode === "set" && (
              <>
                <PinInput value={pin2} onChange={setPin2} label="Nhập lại mã PIN" />
                {pin2.length === 6 && pin !== pin2 && <p className="text-xs text-loss">Hai lần nhập chưa khớp</p>}
              </>
            )}
            {step.mode === "enter" && <p className="text-[11px] text-muted">Quên PIN? Gửi /resetpin cho bot Telegram từ chat đã kết nối, rồi tạo PIN mới.</p>}
            <div className="flex justify-between gap-2">
              <Button disabled={busy} onClick={reset}>
                ← Chọn tên khác
              </Button>
              <Button type="submit" tone="primary" disabled={busy || !pinOk}>
                {step.mode === "set" ? "Tạo PIN & vào" : "Vào"}
              </Button>
            </div>
          </form>
        ) : change ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void changePin();
            }}
            className="flex flex-col gap-3 text-sm"
          >
            <PinInput value={pin} onChange={setPin} label="Mã PIN hiện tại" autoFocus />
            <PinInput value={pin2} onChange={setPin2} label="Mã PIN mới" />
            <div className="flex justify-between gap-2">
              <Button disabled={busy} onClick={reset}>
                ← Quay lại
              </Button>
              <Button type="submit" tone="primary" disabled={busy || pin.length !== 6 || pin2.length !== 6}>
                Đổi PIN
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-muted">
              Mỗi tên có vị thế, nhật ký, danh sách theo dõi và vốn riêng, khóa bằng mã PIN 6 số (nhập 1 lần, thiết bị này nhớ). Tín hiệu và nhóm ngành dùng
              chung.
            </p>
            <div>
              <div className="mb-1.5 text-xs font-semibold">Chọn tên có sẵn</div>
              {users === null ? (
                <p className="text-xs text-muted">Đang tải…</p>
              ) : users.length === 0 ? (
                <p className="text-xs text-muted">Chưa có ai.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => (
                    <Button key={u.username} size="sm" tone={u.username === username ? "primary" : "ghost"} disabled={busy} onClick={() => choose(u)}>
                      {u.hasPin ? "🔒 " : ""}
                      {u.username}
                      {u.owner && " ★"} <span className="text-muted">· {u.open} mã</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim().replace(/\s+/g, " ");
                if (users?.some((u) => u.username.toLowerCase() === n.toLowerCase())) return void choose(users.find((u) => u.username.toLowerCase() === n.toLowerCase())!);
                setStep({ username: n, mode: "set", create: true });
              }}
              className="flex flex-col gap-2"
            >
              <Field label="Hoặc tạo tên mới" hint="2–30 ký tự, không trùng người khác">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="vd: Lan" />
              </Field>
              <div className="flex flex-wrap justify-between gap-2">
                {username ? (
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={async () => (await call("DELETE", "/api/users", {}, "Đã thoát", { reload: navigationAfterSessionChange() === "reload" })) && close()}>
                      Thoát
                    </Button>
                    <Button disabled={busy} onClick={() => setChange(true)}>
                      🔑 Đổi PIN
                    </Button>
                  </div>
                ) : (
                  <span />
                )}
                <Button type="submit" tone="primary" disabled={busy || name.trim().length < 2}>
                  Tiếp tục →
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </>
  );
}
