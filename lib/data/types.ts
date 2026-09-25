export interface Bar {
  date: string; // YYYY-MM-DD, giờ VN
  open: number; // nghìn đồng
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ListedSymbol {
  ticker: string;
  exchange: string; // HOSE | HNX | UPCOM
  companyName: string | null;
  kind: "stock" | "fund"; // fund = chứng chỉ quỹ (ETF/IFC)
}
