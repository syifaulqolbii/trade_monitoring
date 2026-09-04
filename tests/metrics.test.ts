import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  buildClosedPositions,
  toUsd,
  toStdLots,
  netProfitOf,
  monthKey,
  type DealInput,
  type PositionInput,
  type SnapshotInput,
} from "@/lib/metrics";

const d = (iso: string): Date => new Date(iso);

const deal = (over: Partial<DealInput>): DealInput => ({
  ticket: "1",
  positionId: "100",
  symbol: "EURUSD",
  type: 0,
  direction: 0,
  volume: 1,
  price: 1.1,
  profit: 0,
  commission: null,
  swap: null,
  fee: null,
  time: d("2026-01-05T10:00:00Z"),
  ...over,
});

function closedPosition(
  positionId: string,
  open: string,
  close: string,
  profit: number,
  volume = 1,
  extra: Partial<DealInput> = {}
): [DealInput, DealInput] {
  return [
    deal({
      ticket: `o-${positionId}`,
      positionId,
      volume,
      direction: 0,
      type: 0,
      time: d(open),
      price: 1.1,
    }),
    deal({
      ticket: `c-${positionId}`,
      positionId,
      volume,
      direction: 1,
      type: 1,
      time: d(close),
      price: 1.2,
      profit,
      ...extra,
    }),
  ];
}

describe("toUsd (konversi USC→USD)", () => {
  it("tidak mengubah nilai akun normal", () => {
    expect(toUsd(1000, false)).toBe(1000);
  });
  it("membagi 100 untuk akun cent", () => {
    expect(toUsd(123456, true)).toBe(1234.56);
  });
});

describe("netProfitOf", () => {
  it("menjumlahkan profit + komisi + swap + fee", () => {
    const dd = deal({
      profit: 50,
      commission: -5,
      swap: -1.5,
      fee: -0.5,
    });
    expect(netProfitOf(dd)).toBe(43);
  });
});

describe("buildClosedPositions", () => {
  it("menggabungkan deal entry+exit jadi satu posisi tertutup", () => {
    const deals = [
      ...closedPosition("100", "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z", 120),
      ...closedPosition("101", "2026-01-03T08:00:00Z", "2026-01-04T08:00:00Z", -40),
    ];
    const closed = buildClosedPositions(deals);
    expect(closed).toHaveLength(2);
    expect(closed[0].positionId).toBe("100");
    expect(closed[0].netProfit).toBe(120);
    expect(closed[0].volume).toBe(1);
    expect(closed[1].netProfit).toBe(-40);
  });

  it("mengabaikan posisi yang hanya punya satu deal (masih terbuka)", () => {
    const deals = [deal({ positionId: "50", direction: 0 })];
    expect(buildClosedPositions(deals)).toHaveLength(0);
  });
});

describe("computeMetrics", () => {
  it("menghitung win rate dan profit factor", () => {
    const deals = [
      ...closedPosition("1", "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z", 100),
      ...closedPosition("2", "2026-01-03T08:00:00Z", "2026-01-04T08:00:00Z", 50),
      ...closedPosition("3", "2026-01-05T08:00:00Z", "2026-01-06T08:00:00Z", -25),
    ];
    const m = computeMetrics(deals, [], []);
    expect(m.totalTrades).toBe(3);
    expect(m.winRatePct).toBeCloseTo(66.67, 1);
    expect(m.profitFactor).toBeCloseTo(6, 1); // 150/25
    expect(m.netProfit).toBe(125);
    expect(m.totalLots).toBe(3); // 6 deal × 1 lot / 2
  });

  it("profit factor ∞ bila tidak ada loss", () => {
    const deals = [
      ...closedPosition("1", "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z", 10),
    ];
    const m = computeMetrics(deals, [], []);
    expect(m.profitFactor).toBe(Infinity);
  });

  it("growth berdasar equity snapshot pertama vs terakhir", () => {
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1100, equity: 1150, createdAt: d("2026-02-01T00:00:00Z") },
    ];
    const m = computeMetrics([], [], snaps);
    expect(m.growthPct).toBeCloseTo(15, 5);
    expect(m.balance).toBe(1100);
    expect(m.equity).toBe(1150);
  });

  it("menghitung max drawdown dari kurva equity", () => {
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1000, equity: 1300, createdAt: d("2026-01-02T00:00:00Z") },
      { balance: 1000, equity: 1040, createdAt: d("2026-01-03T00:00:00Z") }, // -20% dari 1300
      { balance: 1000, equity: 1235, createdAt: d("2026-01-04T00:00:00Z") },
      { balance: 1000, equity: 1007, createdAt: d("2026-01-05T00:00:00Z") }, // -22.5% dari 1300
    ];
    const m = computeMetrics([], [], snaps);
    expect(m.maxDrawdownPct).toBeCloseTo(22.54, 1);
  });

  it("mengelompokkan statistik per bulan (lots, trade, profit, balance)", () => {
    const deals = [
      ...closedPosition("1", "2026-01-10T08:00:00Z", "2026-01-12T08:00:00Z", 100, 0.5),
      ...closedPosition("2", "2026-01-20T08:00:00Z", "2026-01-25T08:00:00Z", -30, 0.5),
      ...closedPosition("3", "2026-02-02T08:00:00Z", "2026-02-05T08:00:00Z", 200, 2),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1070, equity: 1070, createdAt: d("2026-01-28T00:00:00Z") },
      { balance: 1270, equity: 1270, createdAt: d("2026-02-10T00:00:00Z") },
    ];
    const m = computeMetrics(deals, [], snaps);
    expect(m.monthly).toHaveLength(2);

    const jan = m.monthly.find((x) => x.month === "2026-01")!;
    expect(jan.trades).toBe(2);
    expect(jan.profit).toBe(70);
    expect(jan.lots).toBeCloseTo(1, 5); // 4 deal × 0.5 / 2
    expect(jan.winRate).toBeCloseTo(50, 5);
    expect(jan.balance).toBe(1070); // snapshot Januari

    const feb = m.monthly.find((x) => x.month === "2026-02")!;
    expect(feb.trades).toBe(1);
    expect(feb.profit).toBe(200);
    expect(feb.lots).toBeCloseTo(2, 5);
    expect(feb.balance).toBe(1270); // snapshot Februari
  });

  it("monthKey menghasilkan format YYYY-MM", () => {
    // jam 00:00Z tidak akan pernah lompat bulan di zona waktu mana pun
    expect(monthKey(d("2026-09-15T00:00:00Z"))).toBe("2026-09");
    expect(monthKey(d("2026-12-15T00:00:00Z"))).toBe("2026-12");
  });

  it("akun cent ikut mengkonversi pada input posisi", () => {
    const pos: PositionInput = {
      ticket: "1",
      symbol: "EURUSD",
      type: 0,
      volume: 0.1,
      priceOpen: 1.1,
      priceCurrent: 1.11,
      profit: 1000, // 1000 USC = $10
      openTime: d("2026-01-01T00:00:00Z"),
    };
    const snaps: SnapshotInput[] = [
      { balance: 100000, equity: 101000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 100000, equity: 101000, createdAt: d("2026-01-02T00:00:00Z") },
    ];
    const m = computeMetrics([], [pos], snaps, { cent: true });
    expect(m.balance).toBe(100000);
    expect(toUsd(m.equity, true)).toBe(1010);
  });
});

describe("toStdLots", () => {
  it("akun cent: lot dibagi 100 (1.0 lot cent = 0.01 lot standar)", () => {
    expect(toStdLots(1, true)).toBe(0.01);
    expect(toStdLots(45, true)).toBe(0.45);
    expect(toStdLots(0.5, true)).toBe(0.005);
  });

  it("akun standar: lot tidak berubah", () => {
    expect(toStdLots(1, false)).toBe(1);
    expect(toStdLots(2.5, false)).toBe(2.5);
  });
});