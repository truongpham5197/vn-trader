/** Giá (nghìn đồng) hiển thị tối đa 2 số thập phân — float từ DB/tính toán hay ra 91.28000000001. */
export const px = (v: number | string | null | undefined, empty = "—") =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? empty : Number(v).toFixed(2);
