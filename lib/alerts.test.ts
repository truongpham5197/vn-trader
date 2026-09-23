import { describe, expect, it } from "vitest";
import { htmlToAlert } from "./alerts";

describe("htmlToAlert", () => {
  it("bỏ thẻ HTML, tách tiêu đề/nội dung, unescape", () => {
    expect(htmlToAlert("🛑 <b>HPG</b> chạm cắt lỗ 19.5\nGiá &lt; MA10 &amp; vol thấp\n")).toEqual({
      title: "🛑 HPG chạm cắt lỗ 19.5",
      body: "Giá < MA10 & vol thấp",
    });
  });
  it("tiêu đề quá dài → rút gọn, body giữ đủ", () => {
    const long = "A".repeat(300);
    const r = htmlToAlert(`${long}\nchi tiết`);
    expect(r.title.length).toBe(151);
    expect(r.body).toBe(`${long}\nchi tiết`);
  });
  it("chỉ 1 dòng → body rỗng", () => {
    expect(htmlToAlert("<i>ok</i>")).toEqual({ title: "ok", body: "" });
  });
});
