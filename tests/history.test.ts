import { describe, it, expect } from "vitest";
import {
  buildHistory,
  summarizeHistory,
  filterRows,
  type DealRow,
} from "@/lib/history";

const d = (iso: string): Date => new Date(iso);

const deal = (over: Partial<DealRow>): DealRow => ({
  positionId: "100",
  ticket: "1",
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

describe("buildHistory", () => {
  it("menggabungkan entry (direction 0) + exit (direction 1) jadi satu trade", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", direction: 0, type: 0, price: 1.1, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "x1", direction: 1, type: 1, price: 1.2, profit: 100, time: d("2026-01-02T08:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].positionId).toBe("100");
    expect(rows[0].type).toBe("buy");
    expect(rows[0].netProfit).toBe(100);
    expect(rows[0].openPrice).toBe(1.1);
    expect(rows[0].closePrice).toBe(1.2);
  });

  it("REGRESI: exit via close-by (direction 3) tetap tercatat", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", direction: 0, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "x1", direction: 3, type: 1, price: 1.2, profit: -50, time: d("2026-01-02T08:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netProfit).toBe(-50);
  });

  it("REGRESI: exit via reversal (direction 2 / inout) tetap tercatat", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", direction: 0, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "x1", direction: 2, type: 1, price: 1.2, profit: 30, time: d("2026-01-02T08:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("posisi yang masih terbuka (belum ada deal keluar) tidak dihitung", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", direction: 0, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "e2", direction: 0, volume: 0.5, time: d("2026-01-01T09:00:00Z") }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("REGRESI: trade yang deal entry-nya tidak pernah tersinkron tetap tampil (fallback entry = deal terlama)", () => {
    // posisi dibuka sebelum bridge berjalan → hanya deal exit yang tersinkron
    const rows = buildHistory([
      deal({ ticket: "x1", direction: 1, type: 1, price: 1.2, profit: 75, time: d("2026-01-02T08:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netProfit).toBe(75);
    expect(rows[0].closeTime).toEqual(d("2026-01-02T08:00:00Z"));
  });

  it("partial close: semua deal satu posisi jadi satu baris", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", direction: 0, volume: 1, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "x1", direction: 1, volume: 0.5, profit: 40, time: d("2026-01-01T12:00:00Z") }),
      deal({ ticket: "x2", direction: 1, volume: 0.5, profit: 60, time: d("2026-01-02T12:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netProfit).toBe(100);
    expect(rows[0].closeTime).toEqual(d("2026-01-02T12:00:00Z"));
  });

  it("deposit/withdrawal (position_id 0) tidak dihitung sebagai trade", () => {
    const rows = buildHistory([
      deal({ ticket: "b1", positionId: "0", type: 2, direction: 0, volume: 0, symbol: "", profit: 30000 }),
      deal({ ticket: "b2", positionId: null, type: 3, direction: 1, volume: 0, symbol: "", profit: -500 }),
      deal({
        ticket: "e1", direction: 0, time: d("2026-01-01T08:00:00Z"),
      }),
      deal({ ticket: "x1", direction: 1, type: 1, profit: 10, time: d("2026-01-02T08:00:00Z") }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netProfit).toBe(10);
  });

  it("urutan hasil: trade terbaru (closeTime) di atas", () => {
    const rows = buildHistory([
      deal({ ticket: "e1", positionId: "1", direction: 0, time: d("2026-01-01T08:00:00Z") }),
      deal({ ticket: "x1", positionId: "1", direction: 1, profit: 10, time: d("2026-01-05T08:00:00Z") }),
      deal({ ticket: "e2", positionId: "2", direction: 0, time: d("2026-01-06T08:00:00Z") }),
      deal({ ticket: "x2", positionId: "2", direction: 1, profit: 20, time: d("2026-01-07T08:00:00Z") }),
    ]);
    expect(rows[0].positionId).toBe("2");
    expect(rows[1].positionId).toBe("1");
  });
});

describe("summarizeHistory & filterRows", () => {
  const rows = buildHistory([
    deal({ ticket: "e1", positionId: "1", direction: 0, symbol: "XAUUSD", time: d("2026-01-01T08:00:00Z") }),
    deal({ ticket: "x1", positionId: "1", direction: 1, symbol: "XAUUSD", price: 2000, profit: 100, time: d("2026-01-02T08:00:00Z") }),
    deal({ ticket: "e2", positionId: "2", direction: 0, symbol: "EURUSD", type: 1, time: d("2026-02-01T08:00:00Z") }),
    deal({ ticket: "x2", positionId: "2", direction: 1, symbol: "EURUSD", type: 0, price: 1.05, profit: -40, time: d("2026-02-02T08:00:00Z") }),
  ]);

  it("ringkasan pnl, win/loss, profit factor", () => {
    const s = summarizeHistory(rows);
    expect(s.pnl).toBe(60);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.profitFactor).toBeCloseTo(2.5, 5); // 100/40
  });

  it("filterRows by symbol, month, type, q", () => {
    expect(filterRows(rows, { symbol: "XAUUSD" })).toHaveLength(1);
    expect(filterRows(rows, { month: "2026-02" })).toHaveLength(1);
    expect(filterRows(rows, { type: "sell" })).toHaveLength(1);
    expect(filterRows(rows, { q: "xau" })).toHaveLength(1);
    expect(filterRows(rows, {})).toHaveLength(2);
  });
});
