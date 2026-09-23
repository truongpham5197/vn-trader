"use client";

import { useEffect, useState } from "react";
import { Button, Field, Modal, inputCls, useApi } from "./ui";

type U = { username: string; owner: boolean; open: number };

/** Chọn/tạo tên người dùng (không mật khẩu) — mỗi tên có vị thế, nhật ký, theo dõi, vốn riêng. */
export default function UserSwitcher({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<U[] | null>(null);
  const [name, setName] = useState("");
  const { call, busy } = useApi();

  useEffect(() => {
    if (!username) setOpen(true);
  }, [username]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open]);

  const done = (ok: boolean) => ok && (setOpen(false), setName(""));
  const pick = async (u: string) => done(await call("POST", "/api/users", { username: u }, `Đang dùng tên ${u}`));

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
      <Modal open={open} title="Bạn là ai?" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-xs text-muted">
            Không cần mật khẩu — mỗi tên có vị thế, nhật ký, danh sách theo dõi và vốn riêng. Ai biết tên cũng xem/sửa được, nên đừng ghi thông tin nhạy
            cảm. Tín hiệu và nhóm ngành dùng chung.
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
                  <Button key={u.username} size="sm" tone={u.username === username ? "primary" : "ghost"} disabled={busy} onClick={() => pick(u.username)}>
                    {u.username}
                    {u.owner && " ★"} <span className="text-muted">· {u.open} mã</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              done(await call("POST", "/api/users", { username: name, create: true }, `Đã tạo tên ${name.trim()}`));
            }}
            className="flex flex-col gap-2"
          >
            <Field label="Hoặc tạo tên mới" hint="2–30 ký tự, không trùng người khác">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="vd: Lan" />
            </Field>
            <div className="flex justify-between gap-2">
              {username ? (
                <Button disabled={busy} onClick={async () => done(await call("DELETE", "/api/users", {}, "Đã thoát"))}>
                  Thoát
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" tone="primary" disabled={busy || name.trim().length < 2}>
                Tạo &amp; dùng
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
