import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  growthDrawdownSeries,
  type DealInput,
  type SnapshotInput,
} from "@/lib/metrics";

const d = (iso: string): Date => new Date(iso);

const cash = (profit: number, iso: string): DealInput => ({
  ticket: iso,
  positionId: "0",
  symbol: "",
  type: 2,
  direction: 0,
  volume: 0,
  price: 0,
  profit,
  commission: null,
  swap: null,
  fee: null,
  time: d(iso),
});

describe("cash-flow-adjusted growth", () => {
  it("deposit tidak menjadi growth", () => {
    const snaps: SnapshotInput[] = [
      { balance: 40000, equity: 40000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 50000, equity: 50000, createdAt: d("2026-01-02T00:00:00Z") },
    ];
    const m = computeMetrics([cash(10000, "2026-01-01T12:00:00Z")], [], snaps);
    expect(m.growthPct).toBeCloseTo(0, 5);
    expect(m.maxDrawdownPct).toBeCloseTo(0, 5);
  });

  it("withdrawal tidak menjadi drawdown", () => {
    const snaps: SnapshotInput[] = [
      { balance: 50000, equity: 50000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 40000, equity: 40000, createdAt: d("2026-01-02T00:00:00Z") },
    ];
    const m = computeMetrics([cash(-10000, "2026-01-01T12:00:00Z")], [], snaps);
    expect(m.growthPct).toBeCloseTo(0, 5);
    expect(m.maxDrawdownPct).toBeCloseTo(0, 5);
  });

  it("kurva growth mengecualikan deposit di dalam range", () => {
    const snaps: SnapshotInput[] = [
      { balance: 40000, equity: 40000, createdAt: d("2026-01-01T00:00:00Z") },
      { balance: 50000, equity: 50000, createdAt: d("2026-01-02T00:00:00Z") },
    ];
    const series = growthDrawdownSeries(snaps, [
      cash(10000, "2026-01-01T12:00:00Z"),
    ]);
    expect(series.at(-1)?.growthPct).toBeCloseTo(0, 5);
  });

  it("REGRESI: deposit SEBELUM awal range tetap dikoreksi dari cash-flow history", () => {
    // Range visual: 10 Januari. Deposit terjadi 5 Januari (di luar range).
    // allCashFlow harus mencakup seluruh riwayat, bukan hanya di range.
    const snaps: SnapshotInput[] = [
      { balance: 50000, equity: 50000, createdAt: d("2026-01-10T00:00:00Z") },
      { balance: 50200, equity: 50200, createdAt: d("2026-01-11T00:00:00Z") },
    ];
    const allCashFlow = [cash(10000, "2026-01-05T00:00:00Z")];
    const series = growthDrawdownSeries(snaps, allCashFlow);
    // adjusted equity: 50000-10000=40000, 50200-10000=40200 → +0.5%
    expect(series[0].growthPct).toBeCloseTo(0, 5);
    expect(series[1].growthPct).toBeCloseTo(0.5, 5);
  });
});
