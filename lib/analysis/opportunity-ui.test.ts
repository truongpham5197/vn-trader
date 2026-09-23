import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityText } from "../../app/components/OpportunityStatus";
import { assessOpportunity } from "./opportunity";

describe("trình bày trạng thái gợi ý", () => {
  it("setup có vùng giá vẫn hiện chờ xác nhận, không hiện xác suất thắng", () => {
    const assessment = assessOpportunity({ confirmed: false, price: 20, stop: 19, target: 23, buyZone: [19.8, 20.2], fresh: true });
    const html = renderToStaticMarkup(createElement(OpportunityText, { assessment, trigger: "Chờ đóng cửa vượt đỉnh", date: "2026-09-22" }));
    expect(html).toContain("Chờ xác nhận");
    expect(html).toContain("Chờ đóng cửa vượt đỉnh");
    expect(html).toContain("2026-09-22");
    expect(html).toContain("không phải xác suất thắng");
  });
});
