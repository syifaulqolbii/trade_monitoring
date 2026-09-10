import { prisma } from "./prisma";
import {
  computeMetrics,
  growthDrawdownSeries,
  openPositionsSummary,
  symbolStats,
  type GrowthDDPoint,
  type Metrics,
  type SymbolStat,
} from "./metrics";

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

export interface AccountWithMetrics {
  id: string;
  name: string;
  broker: string;
  login: string;
  server: string;
  cent: boolean;
  currency: string | null;
  lastSyncAt: Date | null;
  metrics: Metrics;
  openSummary: { count: number; volume: number; profit: number; swap: number };
  growthDD: GrowthDDPoint[];
  symbolStats: SymbolStat[];
  raw: Awaited<ReturnType<typeof prisma.account.findUnique>>;
}

export async function loadAccountMetrics(
  accountId: string,
  sinceMs?: number
): Promise<AccountWithMetrics | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const timeFilter =
    sinceMs !== undefined ? { time: { gte: new Date(sinceMs) } } : {};
  const snapFilter =
    sinceMs !== undefined
      ? { createdAt: { gte: new Date(sinceMs) } }
      : {};

  const [deals, positions, snapshots] = await Promise.all([
    prisma.deal.findMany({
      where: { accountId, ...timeFilter },
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
    }),
    prisma.snapshot.findMany({
      where: { accountId, ...snapFilter },
      select: { balance: true, equity: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const metrics = computeMetrics(deals, positions, snapshots, {
    cent: account.cent,
  });

  const openSummary = openPositionsSummary(positions, { cent: account.cent });

  return {
    id: account.id,
    name: account.name,
    broker: account.broker,
    login: account.login,
    server: account.server,
    cent: account.cent,
    currency: account.currency,
    lastSyncAt: account.lastSyncAt,
    metrics,
    openSummary,
    growthDD: growthDrawdownSeries(snapshots, deals),
    symbolStats: symbolStats(deals),
    raw: account,
  };
}