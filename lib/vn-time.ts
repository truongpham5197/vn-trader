export function vnToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Date object đã shift theo giờ VN — getHours()/getDay() trả giờ VN. */
export function vnNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}
