import { prisma } from "./prisma";

const DEFAULTS: Record<string, string> = {
  navVnd: process.env.NAV_VND ?? "500000000",
  riskPct: process.env.RISK_PCT ?? "0.01",
  maxPositions: "5",
  maxSectorPct: "0.4",
  dailyLossLimitPct: "0.02",
  universeMinValueVnd: "5000000000", // GTGD TB 20 phiên > 5 tỷ (universe=liquid)
  universe: "vn30", // vn30 | liquid | all — paper trading focus VN30
  scanEnabled: "true",
  topPicksEnabled: "false", // auto-push digest top-5: tắt mặc định, /picks on để bật
  paperTrading: process.env.PAPER_TRADING ?? "true",
  killSwitch: process.env.KILL_SWITCH ?? "false",
};

export async function getSetting(key: keyof typeof DEFAULTS | string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function getNum(key: string): Promise<number> {
  return Number(await getSetting(key)) || 0;
}

export async function getBool(key: string): Promise<boolean> {
  return (await getSetting(key)) === "true";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
