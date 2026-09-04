import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listAccountsForPicker, resolveAccount } from "@/lib/queries";
import { fmtMoney, fmtLots, fmtDateTime } from "@/lib/format";
import { monthKey } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) ?? undefined;

interface DealRow {
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

interface HistoryRow {
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

/** Kelompokkan deal jadi trade tertutup (entry+exit per posisi).
 *  Deposit/withdrawal/bonus punya position_id = 0 di MT5 (string "0" setelah
 *  sync) — harus dilewati, bukan posisi trading. */
function isPositionDeal(d: DealRow): d is DealRow & { positionId: string } {
  if (!d.positionId || d.positionId === "0") return false;
  if (d.type === 2 || d.type === 3) return false; // balance/credit
  return true;
}

function buildHistory(deals: DealRow[]): HistoryRow[] {
  const byPos = new Map<string, DealRow[]>();
  for (const d of deals) {
    if (!isPositionDeal(d)) continue;
    const arr = byPos.get(d.positionId) ?? [];
    arr.push(d);
    byPos.set(d.positionId, arr);
  }
  const rows: HistoryRow[] = [];
  for (const [positionId, arr] of byPos) {
    const entry = arr.find((d) => d.direction === 0);
    const exit = arr.find((d) => d.direction === 1);
    if (!entry || !exit) continue;
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

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const sp = await searchParams;
  const account = await resolveAccount(first(sp.acc));
  const accounts = await listAccountsForPicker();

  if (!account || accounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <div className="text-3xl">📭</div>
          <h1 className="mt-3 text-lg font-semibold">Belum ada akun</h1>
          <p className="mt-2 text-sm text-zinc-500">
            <Link href="/accounts" className="text-emerald-400 underline">Tambah akun</Link> dulu untuk melihat riwayat.
          </p>
        </div>
      </div>
    );
  }

  const accountFull = await prisma.account.findUnique({
    where: { id: account.id },
    select: { id: true, name: true, broker: true, login: true, server: true, cent: true },
  });
  if (!accountFull) return null;

  const allDeals = await prisma.deal.findMany({
    where: { accountId: account.id },
    select: {
      positionId: true,
      ticket: true,
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
  });

  let rows = buildHistory(allDeals as DealRow[]);

  const symbolFilter = (first(sp.symbol) ?? "").trim();
  const monthFilter = (first(sp.month) ?? "").trim();
  const typeFilter = (first(sp.type) ?? "").trim();
  if (symbolFilter) rows = rows.filter((r) => r.symbol === symbolFilter);
  if (monthFilter) rows = rows.filter((r) => monthKey(r.closeTime) === monthFilter);
  if (typeFilter === "buy" || typeFilter === "sell") {
    rows = rows.filter((r) => r.type === typeFilter);
  }

  const symbols = [...new Set(allDeals.map((d) => d.symbol))].sort();
  const months = [...new Set(rows.map((r) => monthKey(r.closeTime)))].sort().reverse();

  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const cent = accountFull.cent;

  const filterLink = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ acc: account.id, ...extra });
    return `/history?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Riwayat Trade</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {accountFull.name} · {accountFull.broker} · {accountFull.login} · {accountFull.server}
            {" "}— {rows.length} trade tertutup
          </p>
        </div>
        {accounts.length > 1 && (
          <div className="flex gap-2">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={filterLink({ acc: a.id })}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  a.id === account.id
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {a.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Filter — GET form, tanpa JavaScript */}
      <form method="get" action="/history" className="mb-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="acc" value={account.id} />
        <select
          name="symbol"
          defaultValue={symbolFilter}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
        >
          <option value="">Semua Simbol</option>
          {symbols.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          name="month"
          defaultValue={monthFilter}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
        >
          <option value="">Semua Bulan</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={typeFilter}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
        >
          <option value="">Buy & Sell</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Terapkan Filter
        </button>
        {(symbolFilter || monthFilter || typeFilter) && (
          <Link
            href={`/history?acc=${account.id}`}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-500"
          >
            ✕ Reset
          </Link>
        )}
      </form>

      {cent && (
        <p className="mb-3 text-xs text-zinc-600">
          Akun cent: volume ditampilkan dalam <b>lot standar</b> (1.0 lot cent =
          0.01 lot standar, kontrak 1 lot = 1.000 unit).
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        {pageRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">Tidak ada trade</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Simbol</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 text-right font-medium">
                  Lot{cent ? " (std)" : ""}
                </th>
                <th className="px-4 py-3 text-right font-medium">Harga Buka</th>
                <th className="px-4 py-3 text-right font-medium">Harga Tutup</th>
                <th className="px-4 py-3 font-medium">Waktu</th>
                <th className="px-4 py-3 text-right font-medium">Profit</th>
                <th className="px-4 py-3 text-right font-medium">Komisi</th>
                <th className="px-4 py-3 text-right font-medium">Swap</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.positionId} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{r.positionId}</td>
                  <td className="px-4 py-2.5 font-medium">{r.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        r.type === "buy"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {r.type === "buy" ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtLots(r.volume, { cent })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.openPrice.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.closePrice.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">
                    {fmtDateTime(r.closeTime)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      r.netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fmtMoney(r.netProfit, { cent })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                    {fmtMoney(r.commission, { cent })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                    {fmtMoney(r.swap, { cent })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-zinc-500">
            Halaman {safePage} dari {totalPages}
          </span>
          <div className="flex gap-2">
            {safePage > 1 && (
              <Link
                href={filterLink({ ...(symbolFilter && { symbol: symbolFilter }), ...(monthFilter && { month: monthFilter }), ...(typeFilter && { type: typeFilter }), page: String(safePage - 1) })}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
              >
                ← Sebelumnya
              </Link>
            )}
            {safePage < totalPages && (
              <Link
                href={filterLink({ ...(symbolFilter && { symbol: symbolFilter }), ...(monthFilter && { month: monthFilter }), ...(typeFilter && { type: typeFilter }), page: String(safePage + 1) })}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
              >
                Berikutnya →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}