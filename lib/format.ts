/** Giá (nghìn đồng) hiển thị tối đa 2 số thập phân — float từ DB/tính toán hay ra 91.28000000001. */
export const px = (v: number | string | null | undefined, empty = "—") =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? empty : Number(v).toFixed(2);

/** "2026-09-25" → "25/09/26" — năm 2 số đủ dùng cho sự kiện/tin gần đây. */
export const dmy = (d: string | null | undefined) =>
  d ? `${d.slice(5).split("-").reverse().join("/")}/${d.slice(2, 4)}` : "—";
