import { monthKey } from "./metrics";

export interface DealRow {
  positionId: string | null;
  ticket: string;
  symbol: string;
  type: number;
  direction: number;
  volume: number;
  price: number;
  profit: number;
  commission: number | null;
  swap: number | null;
  fee: number | null;
  time: Date;
}

export interface HistoryRow {
  positionId: string;
  symbol: string;
  type: "buy" | "sell";
  volume: number;
  openTime: Date;
  closeTime: Date;
  openPrice: number;
  closePrice: number;
  netProfit: number;
  commission: number;
  swap: number;
}

/** Deal yang benar-benar posisi trading (deposit/withdraw position_id=0 dilewati). */
function isPositionDeal(d: DealRow): d is DealRow & { positionId: string } {
  if (!d.positionId || d.positionId === "0") return false;
  if (d.type === 2 || d.type === 3) return false; // balance/credit
  return true;
}

/** Kelompokkan deal jadi trade tertutup (entry+exit per posisi). */
export function buildHistory(deals: DealRow[]): HistoryRow[] {
  const byPos = new Map<string, DealRow[]>();
  for (const d of deals) {
    if (!isPositionDeal(d)) continue;
    const arr = byPos.get(d.positionId) ?? [];
    arr.push(d);
    byPos.set(d.positionId, arr);
  }
  const rows: HistoryRow[] = [];
  for (const [positionId, arr] of byPos) {
    // Urutkan per waktu agar penentuan entry/exit konsisten.
    arr.sort((a, b) => a.time.getTime() - b.time.getTime());
    // Exit = deal keluar TERAKHIR: direction 1 (out), 2 (inout/reversal),
    // 3 (out_by/close-by). Dulu hanya direction === 1 yang dianggap exit,
    // sehingga trade yang ditutup via close-by/reversal tidak pernah tampil.
    // Pakai deal keluar terakhir agar closeTime/closePrice akurat saat
    // posisi ditutup bertahap (partial close).
    let exit: DealRow | undefined;
    for (const d of arr) if (d.direction !== 0) exit = d;
    if (!exit) continue; // belum ada deal keluar → posisi masih terbuka
    // Entry: deal masuk (direction 0). Bila deal entry tidak pernah tersinkron
    // (posisi dibuka sebelum bridge berjalan / cache terminal stale), pakai
    // deal terlama sebagai pengganti agar trade tetap muncul di riwayat.
    const entry = arr.find((d) => d.direction === 0) ?? arr[0];
    let net = 0;
    let commission = 0;
    let swap = 0;
    for (const d of arr) {
      net += d.profit + (d.commission ?? 0) + (d.swap ?? 0) + (d.fee ?? 0);
      commission += d.commission ?? 0;
      swap += d.swap ?? 0;
    }
    rows.push({
      positionId,
      symbol: entry.symbol,
      type: entry.type === 0 ? "buy" : "sell",
      volume: entry.volume,
      openTime: entry.time,
      closeTime: exit.time,
      openPrice: entry.price,
      closePrice: exit.price,
      netProfit: net,
      commission,
      swap,
    });
  }
  rows.sort((a, b) => b.closeTime.getTime() - a.closeTime.getTime());
  return rows;
}

export interface HistorySummary {
  pnl: number;
  volume: number;
  wins: number;
  losses: number;
  avgProfit: number;
  profitFactor: number | null;
}

/** Ringkasan dari baris riwayat yang sudah difilter. */
export function summarizeHistory(rows: HistoryRow[]): HistorySummary {
  const wins = rows.filter((r) => r.netProfit > 0);
  const losses = rows.filter((r) => r.netProfit < 0);
  const grossW = wins.reduce((s, r) => s + r.netProfit, 0);
  const grossL = Math.abs(losses.reduce((s, r) => s + r.netProfit, 0));
  return {
    pnl: rows.reduce((s, r) => s + r.netProfit, 0),
    volume: rows.reduce((s, r) => s + r.volume, 0),
    wins: wins.length,
    losses: losses.length,
    avgProfit: rows.length > 0 ? rows.reduce((s, r) => s + r.netProfit, 0) / rows.length : 0,
    profitFactor:
      grossL === 0 ? (grossW > 0 ? Infinity : rows.length === 0 ? null : 0) : grossW / grossL,
  };
}

export function filterRows(
  rows: HistoryRow[],
  f: { symbol?: string; month?: string; type?: string; q?: string }
): HistoryRow[] {
  let out = rows;
  if (f.symbol) out = out.filter((r) => r.symbol === f.symbol);
  if (f.month) out = out.filter((r) => monthKey(r.closeTime) === f.month);
  if (f.type === "buy" || f.type === "sell") out = out.filter((r) => r.type === f.type);
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter(
      (r) =>
        r.positionId.toLowerCase().includes(q) ||
        r.symbol.toLowerCase().includes(q)
    );
  }
  return out;
}
