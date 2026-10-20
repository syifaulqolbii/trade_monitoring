import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import {
  computeMetrics,
  growthDrawdownSeries,
  monthKey,
  monthlyStats,
  openPositionsSummary,
  symbolStats,
  type DealInput,
  type GrowthDDPoint,
  type Metrics,
  type MonthlyStat,
  type PositionInput,
  type SnapshotInput,
  type SymbolStat,
} from "./metrics";
import { rangeStartMs, type RangeKey } from "./range";
import { downsampleSeries } from "./series";

export async function listAccountsForPicker() {
  return prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, login: true },
  });
}

export async function resolveAccount(
  requestedId: string | undefined
): Promise<{ id: string } | null> {
  const accounts = await listAccountsForPicker();
  if (accounts.length === 0) return null;
  return accounts.find((a) => a.id === requestedId) ?? accounts[0];
}

export interface DashboardPosition {
  id: string;
  ticket: string;
  symbol: string;
  type: number;
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  swap: number | null;
  openTime: string;
}

export interface DashboardData {
  metrics: Metrics;
  monthlyAll: MonthlyStat[];
  openSummary: { count: number; volume: number; profit: number; swap: number };
  growthDD: GrowthDDPoint[];
  symbolStats: SymbolStat[];
  positions: DashboardPosition[];
  hasAnySnapshot: boolean;
}

interface DashboardBase {
  deals: DealInput[];
  positions: DashboardPosition[];
  monthlySnapshots: SnapshotInput[];
}

type RawSnapshot = {
  balance: number;
  equity: number;
  createdAt: Date | number | bigint;
};

/** Chart cuma butuh ~240 titik; angka metrik tetap dihitung dari deret penuh. */
const EQUITY_CHART_POINTS = 240;
const GROWTH_CHART_POINTS = 160;
/** Target titik snapshot per rentang. Resolusi menyesuaikan panjang riwayat. */
const SNAPSHOT_TARGET_POINTS = 4000;
const SNAPSHOT_MIN_BUCKET_MS = 60_000;
/** Data dashboard boleh tertinggal maksimal 15 detik (AutoRefresh 30 detik). */
const DASHBOARD_CACHE_SECONDS = 15;

function toSnapshotInput(row: RawSnapshot): SnapshotInput {
  const t =
    row.createdAt instanceof Date
      ? row.createdAt.getTime()
      : Number(row.createdAt);
  return {
    balance: Number(row.balance),
    equity: Number(row.equity),
    createdAt: new Date(t).toISOString(),
  };
}

/** Deret snapshot dalam rentang, di-bucket di SQL supaya Prisma tidak
 *  mendeserialisasi ratusan ribu baris pada setiap request. Titik pertama &
 *  terakhir selalu disertakan agar batas rentang tetap akurat. */
async function loadSampledSnapshots(
  accountId: string,
  sinceMs: number
): Promise<SnapshotInput[]> {
  const where = {
    accountId,
    createdAt: { gte: new Date(sinceMs) },
  };

  const bounds = await Promise.all([
    prisma.snapshot.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      select: { balance: true, equity: true, createdAt: true },
    }),
    prisma.snapshot.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { balance: true, equity: true, createdAt: true },
    }),
  ]);

  const firstT = bounds[0]?.createdAt.getTime();
  const lastT = bounds[1]?.createdAt.getTime();
  if (firstT === undefined || lastT === undefined) return [];

  const bucketMs = Math.max(
    SNAPSHOT_MIN_BUCKET_MS,
    Math.ceil(Math.max(0, lastT - firstT) / SNAPSHOT_TARGET_POINTS)
  );
  const rangeSql =
    sinceMs > 0 ? Prisma.sql`AND createdAt >= ${sinceMs}` : Prisma.empty;

  const rows = await prisma.$queryRaw<RawSnapshot[]>(Prisma.sql`
    SELECT balance, equity, createdAt FROM (
      SELECT balance, equity, createdAt,
        ROW_NUMBER() OVER (
          PARTITION BY CAST(createdAt / ${bucketMs} AS INTEGER)
          ORDER BY createdAt DESC
        ) AS rn
      FROM Snapshot
      WHERE accountId = ${accountId} ${rangeSql}
    ) WHERE rn = 1
    ORDER BY createdAt ASC
  `);

  const byTime = new Map<number, SnapshotInput>();
  for (const row of rows) {
    const snap = toSnapshotInput(row);
    byTime.set(new Date(snap.createdAt).getTime(), snap);
  }
  for (const row of bounds) {
    if (!row) continue;
    const snap = toSnapshotInput(row);
    byTime.set(row.createdAt.getTime(), snap);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, snap]) => snap);
}

const getRangeSnapshots = unstable_cache(
  async (accountId: string, sinceMs: number) =>
    loadSampledSnapshots(accountId, sinceMs),
  ["dashboard-snapshots"],
  { revalidate: DASHBOARD_CACHE_SECONDS }
);

const getDashboardBase = unstable_cache(
  async (accountId: string): Promise<DashboardBase> => {
    const [deals, positions, firstSnapshot] = await Promise.all([
      prisma.deal.findMany({
        where: { accountId },
        select: {
          ticket: true,
          positionId: true,
          symbol: true,
          type: true,
          direction: true,
          volume: true,
          price: true,
          profit: true,
          commission: true,
          swap: true,
          fee: true,
          time: true,
        },
        orderBy: { time: "asc" },
      }),
      prisma.position.findMany({
        where: { accountId },
        orderBy: { openTime: "desc" },
        select: {
          id: true,
          ticket: true,
          symbol: true,
          type: true,
          volume: true,
          priceOpen: true,
          priceCurrent: true,
          sl: true,
          tp: true,
          profit: true,
          swap: true,
          openTime: true,
        },
      }),
      prisma.snapshot.findFirst({
        where: { accountId },
        orderBy: { createdAt: "asc" },
        select: { balance: true, equity: true, createdAt: true },
      }),
    ]);

    // Satu snapshot terakhir per bulan cukup untuk kolom "Balance Akhir".
    // Query per bulan memakai index [accountId, createdAt] — jauh lebih murah
    // daripada memuat seluruh riwayat snapshot.
    const months = new Set<string>();
    for (const d of deals) months.add(monthKey(d.time));
    const monthSnapshots = await Promise.all(
      [...months].map((m) => {
        const year = Number(m.slice(0, 4));
        const month = Number(m.slice(5, 7));
        return prisma.snapshot.findFirst({
          where: {
            accountId,
            createdAt: {
              gte: new Date(year, month - 1, 1),
              lt: new Date(year, month, 1),
            },
          },
          orderBy: { createdAt: "desc" },
          select: { balance: true, equity: true, createdAt: true },
        });
      })
    );

    const snapshots = new Map<number, SnapshotInput>();
    for (const row of [firstSnapshot, ...monthSnapshots]) {
      if (!row) continue;
      const snap = toSnapshotInput(row);
      snapshots.set(row.createdAt.getTime(), snap);
    }

    return {
      deals: deals.map((d) => ({ ...d, time: d.time.toISOString() })),
      positions: positions.map((p) => ({ ...p, openTime: p.openTime.toISOString() })),
      monthlySnapshots: [...snapshots.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    };
  },
  ["dashboard-base"],
  { revalidate: DASHBOARD_CACHE_SECONDS }
);

export async function loadDashboardData(
  accountId: string,
  range: RangeKey,
  live?: { balance: number; equity: number }
): Promise<DashboardData> {
  // Batas rentang dibulatkan ke menit agar cache key stabil untuk tab switch,
  // dan supaya filter deal memakai batas yang sama dengan query snapshot.
  const sinceMs = rangeStartMs(
    range,
    new Date(Math.floor(Date.now() / 60_000) * 60_000)
  );

  const [base, snapshots] = await Promise.all([
    getDashboardBase(accountId),
    getRangeSnapshots(accountId, sinceMs ?? 0),
  ]);

  // Snapshot floating di-throttle 5 menit; titik "live" dari Account (update
  // tiap sync) menjaga kartu & ujung kurva tetap real-time.
  const snaps = [...snapshots];
  if (live) {
    snaps.push({
      balance: live.balance,
      equity: live.equity,
      createdAt: new Date().toISOString(),
    });
  }

  const windowDeals =
    sinceMs === undefined
      ? base.deals
      : base.deals.filter((d) => new Date(d.time).getTime() >= sinceMs);

  const metrics = computeMetrics(
    windowDeals,
    base.positions as PositionInput[],
    snaps
  );

  return {
    metrics: {
      ...metrics,
      equityCurve: downsampleSeries(metrics.equityCurve, EQUITY_CHART_POINTS),
    },
    monthlyAll: monthlyStats(base.deals, base.monthlySnapshots),
    openSummary: openPositionsSummary(base.positions),
    growthDD: downsampleSeries(
      growthDrawdownSeries(snaps, windowDeals),
      GROWTH_CHART_POINTS
    ),
    symbolStats: symbolStats(windowDeals),
    positions: base.positions,
    hasAnySnapshot: base.monthlySnapshots.length > 0,
  };
}
