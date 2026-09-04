import { prisma } from "./prisma";

export interface SyncAccountInfo {
  login: string;
  broker?: string;
  server?: string;
  currency?: string;
  leverage?: string;
  company?: string;
  balance: number;
  equity: number;
  margin?: number;
  freeMargin?: number;
}

export interface SyncPosition {
  ticket: string | number;
  symbol: string;
  type: number; // 0 buy, 1 sell
  volume: number;
  priceOpen: number;
  sl?: number | null;
  tp?: number | null;
  priceCurrent: number;
  profit: number;
  swap?: number | null;
  comment?: string | null;
  magic?: number | null;
  openTime: string | Date;
}

export interface SyncDeal {
  ticket: string | number;
  positionId?: string | number | null;
  symbol: string;
  type: number;
  direction: number;
  volume: number;
  price: number;
  profit: number;
  commission?: number | null;
  swap?: number | null;
  fee?: number | null;
  comment?: string | null;
  magic?: number | null;
  time: string | Date;
}

export interface SyncPayload {
  account: SyncAccountInfo;
  positions: SyncPosition[];
  deals: SyncDeal[];
}

export interface SyncResult {
  ok: boolean;
  accountId: string;
  dealsAdded: number;
  positionsReplaced: number;
  snapshotCreated: boolean;
  lastSyncAt: string;
}

/**
 * Proses satu payload sinkronisasi dari bridge:
 * - update info akun (balance/equity/currency/dll)
 * - simpan snapshot equity
 * - replace seluruh posisi terbuka
 * - dedupe deal history (unique accountId+ticket)
 */
export async function processSync(
  accountId: string,
  payload: SyncPayload
): Promise<SyncResult> {
  const now = new Date();

  const { account, positions, deals } = payload;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      balance: account.balance,
      equity: account.equity,
      margin: account.margin ?? null,
      freeMargin: account.freeMargin ?? null,
      currency: account.currency ?? null,
      leverage: account.leverage ?? null,
      company: account.company ?? null,
      login: String(account.login),
      server: account.server ?? undefined,
      broker: account.broker ?? undefined,
      lastSyncAt: now,
    },
  });

  await prisma.snapshot.create({
    data: {
      accountId,
      balance: account.balance,
      equity: account.equity,
      margin: account.margin ?? null,
      freeMargin: account.freeMargin ?? null,
      createdAt: now,
    },
  });

  // ---- replace posisi terbuka ----
  await prisma.position.deleteMany({ where: { accountId } });
  if (positions.length > 0) {
    await prisma.position.createMany({
      data: positions.map((p) => ({
        accountId,
        ticket: String(p.ticket),
        symbol: p.symbol,
        type: p.type,
        volume: p.volume,
        priceOpen: p.priceOpen,
        sl: p.sl ?? null,
        tp: p.tp ?? null,
        priceCurrent: p.priceCurrent,
        profit: p.profit,
        swap: p.swap ?? null,
        comment: p.comment ?? null,
        magic: p.magic ?? null,
        openTime: new Date(p.openTime),
      })),
    });
  }

  // ---- deal history: dedupe by (accountId, ticket) ----
  // (SQLite tidak mendukung skipDuplicates di Prisma 6, jadi filter manual)
  let dealsAdded = 0;
  if (deals.length > 0) {
    const existing = await prisma.deal.findMany({
      where: { accountId },
      select: { ticket: true },
    });
    const existingSet = new Set(existing.map((e) => e.ticket));
    const fresh = deals.filter((d) => !existingSet.has(String(d.ticket)));
    if (fresh.length > 0) {
      await prisma.deal.createMany({
        data: fresh.map((d) => ({
          accountId,
          ticket: String(d.ticket),
          positionId: d.positionId != null ? String(d.positionId) : null,
          symbol: d.symbol,
          type: d.type,
          direction: d.direction,
          volume: d.volume,
          price: d.price,
          profit: d.profit,
          commission: d.commission ?? null,
          swap: d.swap ?? null,
          fee: d.fee ?? null,
          comment: d.comment ?? null,
          magic: d.magic ?? null,
          time: new Date(d.time),
        })),
      });
      dealsAdded = fresh.length;
    }
  }

  return {
    ok: true,
    accountId,
    dealsAdded,
    positionsReplaced: positions.length,
    snapshotCreated: true,
    lastSyncAt: now.toISOString(),
  };
}