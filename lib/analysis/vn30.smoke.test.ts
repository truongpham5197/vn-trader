import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Nạp .env thủ công (không phụ thuộc dotenv trong node_modules root)
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

describe("vn30Snapshot (smoke, hits Neon)", () => {
  it.skipIf(!process.env.DATABASE_URL)("returns ranked setups", async () => {
    const { vn30Snapshot } = await import("./vn30");
    const rows = await vn30Snapshot();
    console.log(
      rows
        .slice(0, 10)
        .map(
          (r) =>
            `${r.score.toFixed(0).padStart(3)} ${r.ticker} ${r.setup} zone=${r.buyZone?.map((x) => x.toFixed(1)).join("-") ?? "-"} SL=${r.stop?.toFixed(1) ?? "-"} TP=${r.target?.toFixed(1) ?? "-"}`,
        )
        .join("\n"),
    );
    expect(rows.length).toBeGreaterThan(15);
    expect(rows[0].score).toBeGreaterThanOrEqual(rows[rows.length - 1].score);
  }, 60_000);
});
