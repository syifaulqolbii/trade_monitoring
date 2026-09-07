/**
 * Mesin metrik ala Myfxbook — murni (pure functions), mudah di-unit-test.
 * Semua fungsi menerima array polos (bukan objek Prisma) agar mudah diuji.
 */

export interface DealInput {
  ticket: string;
  positionId?: string | null;
  symbol: string;
  type: number; // 0=buy, 1=sell, 2=balance, 3=credit, ...
  direction: number; // 0=in, 1=out, 2=inout
  volume: number;
  price: number;
  profit: number;
  commission: number | null;
  swap: number | null;
  fee: number | null;
  time: Date | string;
}

export interface PositionInput {
  ticket: string;
  symbol: string;
  type: number;
  volume: number;
  priceOpen: number;
  sl?: number | null;
  tp?: number | null;
  priceCurrent: number;
  profit: number;
  swap?: number | null;
  comment?: string | null;
  magic?: number | null;
  openTime: Date | string;
}

export interface SnapshotInput {
  balance: number;
  equity: number;
  createdAt: Date | string;
}

export interface ClosedPosition {
  positionId: string;
  symbol: string;
  volume: number;
  openTime: Date;
  closeTime: Date;
  netProfit: number; // profit + komisi + swap + fee
  rawProfit: number;
  commission: number;
  swap: number;
}

export interface MonthlyStat {
  month: string; // "2026-09"
  lots: number;
  trades: number;
  winRate: number | null; // 0..100
  profit: number;
  balance: number | null; // balance akhir bulan (snapshot bila ada)
}

export interface EquityPoint {
  t: number; // epoch ms
  balance: number;
  equity: number;
}

export interface Metrics {
  balance: number;
  equity: number;
  growthPct: number; // berdasar equity vs equity pertama
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  profitFactor: number | null; // null = belum ada profit maupun loss
  winRatePct: number | null;
  totalTrades: number;
  totalLots: number;
  netProfit: number;
  monthly: MonthlyStat[];
  equityCurve: EquityPoint[];
  startBalance: number;
  startEquity: number;
}

const asDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

export function netProfitOf(d: DealInput): number {
  return (
    d.profit +
    (d.commission ?? 0) +
    (d.swap ?? 0) +
    (d.fee ?? 0)
  );
}

/** Konversi amount akun cent (USC) ke USD: USC / 100 */
export function toUsd(amount: number, cent: boolean): number {
  return cent ? amount / 100 : amount;
}

/** Konversi lot akun cent ke lot standar (÷100).
 *  Akun cent umumnya ber-kontrak 1 lot = 1.000 unit = 0.01 lot standar
 *  (mis. akun Cent Valetax), jadi 1.0 lot cent ≈ 0.01 lot standar. */
export function toStdLots(lots: number, cent: boolean): number {
  return cent ? lots / 100 : lots;
}

/** Deal yang benar-benar bagian dari posisi trading.
 *  Deposit/withdrawal/bonus (balance & credit op) di MT5 punya position_id = 0 —
 *  bukan posisi, tidak boleh dihitung sebagai profit (ala Myfxbook: deposit
 *  tidak masuk Net Profit). Guard lama (!d.positionId) tidak menangkap string "0". */
function isPositionDeal(d: DealInput): d is DealInput & { positionId: string } {
  if (!d.positionId || d.positionId === "0") return false;
  if (d.type === 2 || d.type === 3) return false; // balance/credit — jaga-jaga
  return true;
}

/** Kelompokkan deal jadi posisi tertutup (pasangan entry–exit per positionId). */
export function buildClosedPositions(deals: DealInput[]): ClosedPosition[] {
  const byPosition = new Map<string, DealInput[]>();
  for (const d of deals) {
    if (!isPositionDeal(d)) continue;
    const arr = byPosition.get(d.positionId) ?? [];
    arr.push(d);
    byPosition.set(d.positionId, arr);
  }

  const result: ClosedPosition[] = [];
  for (const [positionId, arr] of byPosition) {
    // Butuh minimal satu deal keluar (direction ≠ 0: out/inout/out_by).
    // Posisi yang masih terbuka hanya punya deal masuk → tidak dihitung.
    // Dulu syaratnya arr.length >= 2 tanpa cek arah — trade yang ditutup
    // via close-by (direction 3) / reversal (direction 2) ikut hilang.
    if (!arr.some((d) => d.direction !== 0)) continue;
    let net = 0;
    let raw = 0;
    let commission = 0;
    let swap = 0;
    let volume = 0;
    let openTime: Date | null = null;
    let closeTime: Date | null = null;
    let symbol = "";
    for (const d of arr) {
      net += netProfitOf(d);
      raw += d.profit;
      commission += d.commission ?? 0;
      swap += d.swap ?? 0;
      const t = asDate(d.time);
      if (!openTime || t < openTime) openTime = t;
      if (!closeTime || t > closeTime) closeTime = t;
      if (d.volume > volume) {
        volume = d.volume;
        symbol = d.symbol;
      }
    }
    if (!openTime || !closeTime) continue;
    result.push({
      positionId,
      symbol,
      volume,
      openTime,
      closeTime,
      netProfit: net,
      rawProfit: raw,
      commission,
      swap,
    });
  }
  result.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
  return result;
}

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function monthKey(d: Date | string): string {
  return monthKeyOf(asDate(d));
}

/** Hitung semua metrik utama dari data akun. */
export function computeMetrics(
  deals: DealInput[],
  positions: PositionInput[],
  snapshots: SnapshotInput[],
  opts: { cent?: boolean } = {}
): Metrics {
  const cent = opts.cent ?? false;
  const closed = buildClosedPositions(deals);

  // ---- snapshot terurut ----
  const snaps = [...snapshots]
    .map((s) => ({
      balance: s.balance,
      equity: s.equity,
      t: asDate(s.createdAt).getTime(),
    }))
    .sort((a, b) => a.t - b.t);

  const startBalance = snaps.length > 0 ? snaps[0].balance : 0;
  const startEquity = snaps.length > 0 ? snaps[0].equity : startBalance;

  const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const balance = lastSnap?.balance ?? startBalance;
  const equity = lastSnap?.equity ?? startBalance;

  // ---- drawdown dari equity curve ----
  let runningMax = -Infinity;
  let maxDD = 0;
  for (const s of snaps) {
    if (s.equity > runningMax) runningMax = s.equity;
    if (runningMax > 0) {
      const dd = ((runningMax - s.equity) / runningMax) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  const currentDD =
    runningMax > 0 ? ((runningMax - equity) / runningMax) * 100 : 0;

  // ---- growth (equity) ----
  const growthPct =
    startEquity !== 0 ? ((equity - startEquity) / Math.abs(startEquity)) * 100 : 0;

  // ---- win rate & profit factor dari posisi tertutup ----
  const totalTrades = closed.length;
  const wins = closed.filter((c) => c.netProfit > 0).length;
  const grossProfit = closed
    .filter((c) => c.netProfit > 0)
    .reduce((s, c) => s + c.netProfit, 0);
  const grossLoss = Math.abs(
    closed.filter((c) => c.netProfit < 0).reduce((s, c) => s + c.netProfit, 0)
  );
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : null;
  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? Infinity : grossProfit === 0 ? null : 0) : grossProfit / grossLoss;
  const netProfit = closed.reduce((s, c) => s + c.netProfit, 0);

  // ---- total lots: volume deal buy/sell / 2 (tiap posisi dihitung sekali) ----
  const totalLots =
    deals
      .filter((d) => d.type === 0 || d.type === 1)
      .reduce((s, d) => s + d.volume, 0) / 2;

  // ---- statistik bulanan ----
  // kumpulkan semua bulan yang muncul (dari deal & posisi tertutup)
  const monthSet = new Set<string>();
  for (const d of deals) monthSet.add(monthKeyOf(asDate(d.time)));
  for (const c of closed) monthSet.add(monthKeyOf(c.closeTime));

  const monthlyMap = new Map<string, MonthlyStat>();
  for (const key of monthSet) {
    monthlyMap.set(key, {
      month: key,
      lots: 0,
      trades: 0,
      winRate: 0,
      profit: 0,
      balance: null,
    });
  }

  for (const c of closed) {
    const m = monthlyMap.get(monthKeyOf(c.closeTime))!;
    m.trades += 1;
    m.profit += c.netProfit;
    if (c.netProfit > 0) m.winRate = (m.winRate ?? 0) + 1; // sementara: hitung wins dulu
  }
  // lots per bulan: total volume deal buy/sell / 2 (tiap round-trip dihitung sekali)
  for (const d of deals) {
    if (d.type !== 0 && d.type !== 1) continue;
    const m = monthlyMap.get(monthKeyOf(asDate(d.time)));
    if (m) m.lots += d.volume / 2;
  }
  // balance akhir bulan + win rate final
  const monthly = [...monthlyMap.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  let cumulative = startBalance;
  for (const m of monthly) {
    if (m.trades > 0) m.winRate = ((m.winRate ?? 0) / m.trades) * 100;
    else m.winRate = null;
    cumulative += m.profit;
    // cari snapshot terakhir dalam bulan tsb
    const endOfMonth = new Date(
      Number(m.month.slice(0, 4)),
      Number(m.month.slice(5, 7)),
      1,
      0,
      0,
      0,
      0
    ).getTime();
    const startOfMonth = new Date(
      Number(m.month.slice(0, 4)),
      Number(m.month.slice(5, 7)) - 1,
      1
    ).getTime();
    const snapInMonth = snaps
      .filter((s) => s.t >= startOfMonth && s.t < endOfMonth)
      .sort((a, b) => b.t - a.t)[0];
    m.balance = snapInMonth ? snapInMonth.balance : cumulative;
  }

  // ---- equity curve ----
  const equityCurve: EquityPoint[] = snaps.map((s) => ({
    t: s.t,
    balance: s.balance,
    equity: s.equity,
  }));

  return {
    balance,
    equity,
    growthPct,
    maxDrawdownPct: maxDD,
    currentDrawdownPct: currentDD,
    profitFactor,
    winRatePct,
    totalTrades,
    totalLots,
    netProfit,
    monthly,
    equityCurve,
    startBalance,
    startEquity,
  };
}

/* ============================================================
 * Ekstra untuk dashboard: kurva growth/drawdown & distribusi simbol
 * ============================================================ */

export interface GrowthDDPoint {
  t: number; // epoch ms
  growthPct: number; // relatif thd equity pertama dalam rentang
  ddPct: number; // underwater drawdown NEGATIF: -(peak-equity)/peak*100
}

/** Kurva "pertumbuhan relatif" + "underwater drawdown" per snapshot. */
export function growthDrawdownSeries(
  snapshots: SnapshotInput[]
): GrowthDDPoint[] {
  const snaps = [...snapshots]
    .map((s) => ({ equity: s.equity, t: asDate(s.createdAt).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (snaps.length === 0) return [];
  const first = snaps[0].equity;
  let runningMax = -Infinity;
  const out: GrowthDDPoint[] = [];
  for (const s of snaps) {
    if (s.equity > runningMax) runningMax = s.equity;
    const growthPct =
      first !== 0 ? ((s.equity - first) / Math.abs(first)) * 100 : 0;
    const ddPct =
      runningMax > 0 ? -((runningMax - s.equity) / runningMax) * 100 : 0;
    out.push({ t: s.t, growthPct, ddPct });
  }
  return out;
}

export interface SymbolStat {
  symbol: string;
  lots: number; // lot round-trip (entry volume)
  volumeShare: number; // 0..100
  wins: number;
  losses: number;
  winRate: number | null; // 0..100
  pnl: number; // net (termasuk komisi/swap/fee)
}

/** Statistik per simbol dari posisi tertutup (untuk kartu distribusi). */
export function symbolStats(deals: DealInput[]): SymbolStat[] {
  const closed = buildClosedPositions(deals);
  const bySymbol = new Map<string, SymbolStat>();
  for (const c of closed) {
    const s =
      bySymbol.get(c.symbol) ??
      ({
        symbol: c.symbol,
        lots: 0,
        volumeShare: 0,
        wins: 0,
        losses: 0,
        winRate: null,
        pnl: 0,
      } as SymbolStat);
    s.lots += c.volume;
    s.pnl += c.netProfit;
    if (c.netProfit > 0) s.wins += 1;
    else if (c.netProfit < 0) s.losses += 1;
    bySymbol.set(c.symbol, s);
  }
  const list = [...bySymbol.values()];
  const totalLots = list.reduce((acc, s) => acc + s.lots, 0);
  for (const s of list) {
    s.volumeShare = totalLots > 0 ? (s.lots / totalLots) * 100 : 0;
    const n = s.wins + s.losses;
    s.winRate = n > 0 ? (s.wins / n) * 100 : null;
  }
  list.sort((a, b) => b.pnl - a.pnl || b.lots - a.lots);
  return list;
}

/** Statistik singkat untuk posisi terbuka (untuk tabel & kartu). */
export function openPositionsSummary(
  positions: PositionInput[],
  opts: { cent?: boolean } = {}
): { count: number; volume: number; profit: number; swap: number } {
  return positions.reduce(
    (acc, p) => {
      acc.count += 1;
      acc.volume += p.volume;
      acc.profit += p.profit;
      acc.swap += p.swap ?? 0;
      return acc;
    },
    { count: 0, volume: 0, profit: 0, swap: 0 }
  );
}