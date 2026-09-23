import { describe, expect, it } from "vitest";
import { quickExits } from "./quick";

describe("quickExits", () => {
  it("−/+8% theo giá vốn, làm tròn bước giá", () => {
    expect(quickExits(21.15)).toEqual({ stop: 19.5, target: 22.8 });
    expect(quickExits(100)).toEqual({ stop: 92, target: 108 });
    expect(quickExits(8)).toEqual({ stop: 7.35, target: 8.65 });
  });
});
