export function vnToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Date object đã shift theo giờ VN — getHours()/getDay() trả giờ VN. */
export function vnNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

/** Phiên HOSE: T2–T6 9:00–15:00 (gồm ATC/PLO). */
export function inVnSession(n = vnNow()): boolean {
  const m = n.getHours() * 60 + n.getMinutes();
  return n.getDay() >= 1 && n.getDay() <= 5 && m >= 9 * 60 && m < 15 * 60;
}

/** Tỷ lệ thời gian khớp lệnh đã trôi qua (9:00–11:30 + 13:00–14:45 = 255 phút), tối thiểu 0.05. */
export function sessionElapsed(n = vnNow()): number {
  const m = n.getHours() * 60 + n.getMinutes();
  const done = Math.min(Math.max(m - 540, 0), 150) + Math.min(Math.max(m - 780, 0), 105);
  return Math.max(done / 255, 0.05);
}
