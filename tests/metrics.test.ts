import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  buildClosedPositions,
  growthDrawdownSeries,
  symbolStats,
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

  it("tidak menganggap deposit/withdrawal (position_id 0) sebagai posisi", () => {
    // deposit 30.000 USC + withdrawal — di MT5 keduanya position_id = 0 (string "0")
    const deals = [
      deal({
        ticket: "bal-1",
        positionId: "0",
        type: 2,
        direction: 0,
        volume: 0,
        symbol: "",
        profit: 30000,
        time: d("2026-01-01T08:00:00Z"),
      }),
      deal({
        ticket: "bal-2",
        positionId: "0",
        type: 2,
        direction: 1,
        volume: 0,
        symbol: "",
        profit: -500,
        time: d("2026-01-02T08:00:00Z"),
      }),
      deal({
        ticket: "bal-3",
        positionId: null, // sebagian broker null, bukan "0"
        type: 3,
        direction: 0,
        volume: 0,
        symbol: "",
        profit: 1000,
        time: d("2026-01-03T08:00:00Z"),
      }),
      ...closedPosition("100", "2026-01-05T08:00:00Z", "2026-01-06T08:00:00Z", 1250),
    ];
    const closed = buildClosedPositions(deals);
    expect(closed).toHaveLength(1);
    expect(closed[0].positionId).toBe("100");
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

  it("net profit TIDAK termasuk deposit/withdrawal/bonus", () => {
    const deals = [
      // 2+ op balance dengan position_id "0" — dulu membentuk posisi palsu ~30.500
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 30000, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "b2", positionId: "0", type: 2, direction: 1, volume: 0, symbol: "", profit: -500, time: d("2026-01-02T08:00:00Z") }),
      deal({ ticket: "b3", positionId: "0", type: 3, direction: 0, volume: 0, symbol: "", profit: 1000, time: d("2026-01-03T08:00:00Z") }),
      ...closedPosition("100", "2026-01-05T08:00:00Z", "2026-01-06T08:00:00Z", 1250),
    ];
    const m = computeMetrics(deals, [], []);
    expect(m.netProfit).toBe(1250); // bukan 1250 + 30500
    expect(m.totalTrades).toBe(1);
    expect(m.winRatePct).toBe(100);
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

  it("growth TIDAK termasuk deposit/withdrawal/bonus", () => {
    const deals = [
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 500, time: d("2026-01-15T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1500, equity: 1500, createdAt: d("2026-02-01T00:00:00Z") },
    ];
    const m = computeMetrics(deals, [], snaps);
    expect(m.growthPct).toBeCloseTo(0, 5); // naik 500 murni deposit
  });

  it("credit/bonus (type 3) tidak mengurangi growth — komponen equity, bukan cash flow", () => {
    const deals = [
      deal({ ticket: "b1", positionId: "0", type: 3, direction: 0, volume: 0, symbol: "", profit: 500, time: d("2026-01-02T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1000, equity: 1500, createdAt: d("2026-02-01T00:00:00Z") }, // +500 credit di equity
    ];
    const m = computeMetrics(deals, [], snaps);
    expect(m.growthPct).toBeCloseTo(50, 5); // dulu: (1500-500-1000)/1000 = 0 atau negatif
  });

  it("growth & drawdown di-clamp: tidak kurang dari -100% / lebih dari 100%", () => {
    const deals = [
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 6000, time: d("2026-01-10T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      // equity -500 sintetis (tak fisik) khusus menguji clamp
      { balance: 7000, equity: -500, createdAt: d("2026-01-20T00:00:00Z") },
    ];
    const m = computeMetrics(deals, [], snaps);
    expect(m.growthPct).toBe(-100); // raw: (-6500-1000)/7000 = -107%
    expect(m.maxDrawdownPct).toBe(100); // raw: (1000+6500)/1000 = 750%

    const series = growthDrawdownSeries(snaps, deals);
    expect(series[1].growthPct).toBe(-100);
    expect(series[1].ddPct).toBe(-100);
  });

  it("deposit sebelum baseline (waktu broker maju) TIDAK double count", () => {
    // Simulasi kasus VPS: deposit #1+#2 (40229.54) sudah masuk baseline,
    // tapi deal time broker (+3h) terbaca SETELAH snapshot pertama.
    const deals = [
      deal({ ticket: "d1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 10200, time: d("2026-09-08T18:42:21Z") }),
      deal({ ticket: "d2", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 30029.54, time: d("2026-09-08T18:46:29Z") }),
      deal({ ticket: "d3", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 5150, time: d("2026-09-08T19:29:12Z") }),
      ...closedPosition("1", "2026-09-09T08:00:00Z", "2026-09-09T09:00:00Z", -7044.94),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 40229.54, equity: 40229.54, createdAt: d("2026-09-08T16:04:11Z") }, // baseline = d1+d2
      { balance: 45379.54, equity: 45379.54, createdAt: d("2026-09-08T16:30:00Z") }, // setelah d3
      { balance: 38334.6, equity: 38334.6, createdAt: d("2026-09-10T08:48:52Z") }, // trading -7044.94
    ];
    const m = computeMetrics(deals, [], snaps);
    // growth = -7044.94 / modal bersih 45379.54 = -15.52% (bukan -117%/-177%)
    expect(m.growthPct).toBeCloseTo(-15.52, 1);
    // DD relatif peak adjusted (= baseline 40229.54): 7044.94/40229.54 = 17.51%
    expect(m.maxDrawdownPct).toBeCloseTo(17.51, 1);

    const series = growthDrawdownSeries(snaps, deals);
    expect(series[2].growthPct).toBeCloseTo(-15.52, 1);
  });

  it("growth menghitung trading profit; withdrawal mengurangi modal bersih", () => {
    const deals = [
      ...closedPosition("1", "2026-01-02T08:00:00Z", "2026-01-03T08:00:00Z", 200),
      // withdrawal -400: equity turun 400, dikembalikan oleh koreksi
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 1, volume: 0, symbol: "", profit: -400, time: d("2026-01-20T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 800, equity: 800, createdAt: d("2026-02-01T00:00:00Z") },
    ];
    const m = computeMetrics(deals, [], snaps);
    // 200 profit / modal bersih 600 (1000 - 400 WD) = 33.33%
    expect(m.growthPct).toBeCloseTo(33.333, 2);
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

  it("deposit tidak memicu peak palsu pada drawdown", () => {
    const deals = [
      ...closedPosition("1", "2026-01-12T08:00:00Z", "2026-01-25T08:00:00Z", -50),
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 500, time: d("2026-01-10T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1500, equity: 1500, createdAt: d("2026-01-20T00:00:00Z") }, // 1000 trade + 500 deposit
      { balance: 1450, equity: 1450, createdAt: d("2026-01-30T00:00:00Z") },
    ];
    const m = computeMetrics(deals, [], snaps);
    // raw: (1500-1450)/1500 = 3.33% — salah
    // adjusted: peak 1000, low 950 → 5%
    expect(m.maxDrawdownPct).toBeCloseTo(5, 5);
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

describe("growthDrawdownSeries", () => {
  it("growth relatif thd equity pertama & dd negatif dari running peak", () => {
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1000, equity: 1200, createdAt: d("2026-01-02T00:00:00Z") },
      { balance: 1000, equity: 900, createdAt: d("2026-01-03T00:00:00Z") },
    ];
    const series = growthDrawdownSeries(snaps);
    expect(series).toHaveLength(3);
    expect(series[0].growthPct).toBeCloseTo(0, 5);
    expect(series[0].ddPct).toBeCloseTo(0, 5);
    expect(series[1].growthPct).toBeCloseTo(20, 5); // 1200 vs 1000
    expect(series[1].ddPct).toBeCloseTo(0, 5); // masih di peak
    expect(series[2].growthPct).toBeCloseTo(-10, 5);
    expect(series[2].ddPct).toBeCloseTo(-25, 5); // (1200-900)/1200
  });

  it("kembalikan array kosong tanpa snapshot", () => {
    expect(growthDrawdownSeries([])).toHaveLength(0);
  });

  it("deposit setelah baseline tidak menaikkan growth & dd", () => {
    const deals = [
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 500, time: d("2026-01-15T00:00:00Z") }),
    ];
    const snaps: SnapshotInput[] = [
      { balance: 1000, equity: 1000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 1500, equity: 1500, createdAt: d("2026-01-20T00:00:00Z") },
    ];
    const series = growthDrawdownSeries(snaps, deals);
    expect(series[1].growthPct).toBeCloseTo(0, 5);
    expect(series[1].ddPct).toBeCloseTo(0, 5);
  });
});

describe("symbolStats", () => {
  it("agregasi pnl, volume share dan win rate per simbol", () => {
    const withSymbol = (
      sym: string,
      pair: [DealInput, DealInput]
    ): DealInput[] => pair.map((dd) => ({ ...dd, symbol: sym }));
    const deals = [
      ...withSymbol("XAUUSD", closedPosition("1", "2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z", 100, 1)),
      ...withSymbol("XAUUSD", closedPosition("2", "2026-01-03T08:00:00Z", "2026-01-04T08:00:00Z", -20, 1)),
      ...withSymbol("EURUSD", closedPosition("3", "2026-01-05T08:00:00Z", "2026-01-06T08:00:00Z", 50, 3)),
    ];
    const stats = symbolStats(deals);
    expect(stats).toHaveLength(2);
    const xau = stats.find((s) => s.symbol === "XAUUSD")!;
    const eur = stats.find((s) => s.symbol === "EURUSD")!;
    expect(xau.pnl).toBe(80);
    expect(xau.winRate).toBeCloseTo(50, 5);
    expect(xau.lots).toBe(2);
    expect(eur.pnl).toBe(50);
    expect(eur.volumeShare).toBeCloseTo(60, 5); // 3/(2+3)
    // urut: pnl terbesar dulu
    expect(stats[0].symbol).toBe("XAUUSD");
  });

  it("mengabaikan deposit & posisi belum tertutup", () => {
    const deals = [
      deal({ ticket: "b", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 99999 }),
      deal({ positionId: "open", direction: 0 }), // cuma entry
    ];
    expect(symbolStats(deals)).toHaveLength(0);
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