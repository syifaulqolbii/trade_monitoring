import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listAccountsForPicker, resolveAccount } from "@/lib/queries";
import { fmtMoney, fmtLots, fmtDateTime, monthLabel } from "@/lib/format";
import { monthKey } from "@/lib/metrics";
import {
  buildHistory,
  filterRows,
  summarizeHistory,
  type HistoryRow,
} from "@/lib/history";
import Icon from "../components/Icon";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const sp = await searchParams;
  const account = await resolveAccount(first(sp.acc));
  const accounts = await listAccountsForPicker();

  if (!account || accounts.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-12 text-center shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
            <Icon name="receipt_long" className="text-[24px]" />
          </div>
          <h1 className="mt-4 font-headline-md text-headline-md font-semibold">
            Belum ada akun
          </h1>
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
            <Link href="/accounts" className="font-medium text-secondary underline">
              Tambah akun
            </Link>{" "}
            dulu untuk melihat riwayat.
          </p>
        </div>
      </div>
    );
  }

  const accountFull = await prisma.account.findUnique({
    where: { id: account.id },
    select: {
      id: true,
      name: true,
      broker: true,
      login: true,
      server: true,
      cent: true,
    },
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

  const built = buildHistory(allDeals as Parameters<typeof buildHistory>[0]);

  const symbolFilter = (first(sp.symbol) ?? "").trim();
  const monthFilter = (first(sp.month) ?? "").trim();
  const typeFilter = (first(sp.type) ?? "").trim();
  const q = (first(sp.q) ?? "").trim();

  const rows = filterRows(built, {
    symbol: symbolFilter,
    month: monthFilter,
    type: typeFilter,
    q,
  });

  const symbols = [...new Set(built.map((r) => r.symbol))].sort();
  const months = [...new Set(built.map((r) => monthKey(r.closeTime)))]
    .sort()
    .reverse();

  const summary = summarizeHistory(rows);
  const winRate =
    rows.length > 0 ? (summary.wins / rows.length) * 100 : null;

  const cent = accountFull.cent;
  const pf =
    summary.profitFactor == null
      ? "-"
      : summary.profitFactor === Infinity
        ? "∞"
        : summary.profitFactor.toFixed(2);

  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(rows.length, safePage * PAGE_SIZE);

  const base = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ acc: account.id });
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    return `/history?${params.toString()}`;
  };
  const filterState = {
    ...(symbolFilter && { symbol: symbolFilter }),
    ...(monthFilter && { month: monthFilter }),
    ...(typeFilter && { type: typeFilter }),
    ...(q && { q }),
  };
  const csvUrl = base({ ...filterState, page: "" });
  const signed = (v: number) => (v >= 0 ? "+" : "") + fmtMoney(v, { cent });
  const toneCls = (v: number) => (v >= 0 ? "text-secondary" : "text-on-tertiary-container");

  return (
    <div className="w-full p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">
                Riwayat Trade
              </h1>
              <span className="ml-2 rounded-full bg-surface-container-high px-2 py-0.5 font-label-tabular text-body-sm font-semibold text-on-surface-variant">
                {rows.length}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">{accountFull.name}</span>
              <span className="text-outline">·</span>
              <span className="tnum font-label-tabular">{accountFull.login}</span>
              <span className="text-outline">·</span>
              <span>{accountFull.server}</span>
              <span className="text-outline">—</span>
              <span className="font-medium text-secondary">
                {rows.length} trade tertutup
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={csvUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3.5 py-2 font-label-tabular text-body-sm font-semibold text-on-surface shadow-sm transition-all hover:bg-surface-container-low"
            >
              <Icon name="file_download" className="text-[18px] text-on-surface-variant" />
              Ekspor CSV
            </a>
            <a
              href={base(filterState)}
              title="Segarkan data"
              className="rounded-xl bg-surface-container-lowest p-2 text-on-surface-variant shadow-sm transition-all hover:bg-surface-container-low hover:text-on-surface"
            >
              <Icon name="sync" className="text-[18px]" />
            </a>
          </div>
        </div>

        {/* Info banner */}
        {cent && (
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-container-low px-3.5 py-2.5 shadow-sm">
            <Icon name="info" className="text-[18px] text-on-surface-variant" />
            <p className="font-body-sm text-body-sm leading-tight text-on-surface-variant">
              <span className="font-semibold text-on-surface">Akun cent:</span> volume
              ditampilkan dalam lot standar (1.0 lot cent = 0.01 lot standar, kontrak
              1 lot = 1.000 unit).
            </p>
          </div>
        )}

        {/* Quick metric strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Total Realized PnL
              </span>
              <Icon name="trending_up" className="text-[16px] text-secondary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`tnum font-metric-display text-metric-display ${toneCls(summary.pnl)}`}>
                {signed(summary.pnl)}
              </span>
            </div>
            <span className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Nett setelah komisi &amp; swap
            </span>
          </div>
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Total Volume
              </span>
              <Icon name="pie_chart" className="text-[16px] text-on-surface-variant" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="tnum font-metric-display text-metric-display text-on-surface">
                {fmtLots(summary.volume, { cent })}
              </span>
              <span className="font-label-tabular text-body-sm font-medium text-on-surface-variant">
                lot std
              </span>
            </div>
            <span className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Total {rows.length} eksekusi
            </span>
          </div>
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Win Rate
              </span>
              <Icon name="military_tech" className="text-[16px] text-on-surface-variant" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="tnum font-metric-display text-metric-display text-on-surface">
                {winRate != null ? `${winRate.toFixed(1)}%` : "-"}
              </span>
              <span className="tnum font-label-tabular text-body-sm font-semibold text-secondary">
                {summary.wins}W
              </span>
              <span className="tnum font-label-tabular text-body-sm font-semibold text-on-surface-variant">
                /
              </span>
              <span className="tnum font-label-tabular text-body-sm font-semibold text-error">
                {summary.losses}L
              </span>
            </div>
            <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full bg-secondary"
                style={{ width: `${Math.max(0, Math.min(100, winRate ?? 0))}%` }}
              />
              <div
                className="h-full bg-error"
                style={{ width: `${winRate != null ? 100 - Math.min(100, winRate) : 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Avg Profit / Trade
              </span>
              <Icon name="stacked_line_chart" className="text-[16px] text-secondary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`tnum font-metric-display text-metric-display ${toneCls(summary.avgProfit)}`}>
                {rows.length > 0 ? signed(summary.avgProfit) : "-"}
              </span>
              <span className="font-label-tabular text-body-sm font-medium text-on-surface-variant">
                PF {pf}
              </span>
            </div>
            <span className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Ekspektansi positif
            </span>
          </div>
        </div>

        {/* Filter bar — GET form */}
        <form
          method="get"
          action="/history"
          className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-lowest p-4 shadow-sm lg:flex-row lg:items-center"
        >
          <input type="hidden" name="acc" value={account.id} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                name="symbol"
                defaultValue={symbolFilter}
                className="cursor-pointer appearance-none rounded-xl bg-surface-container-low py-1.5 pl-3 pr-8 font-label-tabular text-body-sm font-medium text-on-surface outline-none transition-colors hover:bg-surface-container"
              >
                <option value="">Semua Simbol</option>
                {symbols.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Icon
                name="unfold_more"
                className="pointer-events-none absolute right-2 top-2 text-[16px] text-on-surface-variant"
              />
            </div>
            <div className="relative">
              <select
                name="month"
                defaultValue={monthFilter}
                className="cursor-pointer appearance-none rounded-xl bg-surface-container-low py-1.5 pl-3 pr-8 font-label-tabular text-body-sm font-medium text-on-surface outline-none transition-colors hover:bg-surface-container"
              >
                <option value="">Semua Bulan</option>
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <Icon
                name="unfold_more"
                className="pointer-events-none absolute right-2 top-2 text-[16px] text-on-surface-variant"
              />
            </div>
            <div className="relative">
              <select
                name="type"
                defaultValue={typeFilter}
                className="cursor-pointer appearance-none rounded-xl bg-surface-container-low py-1.5 pl-3 pr-8 font-label-tabular text-body-sm font-medium text-on-surface outline-none transition-colors hover:bg-surface-container"
              >
                <option value="">Buy &amp; Sell</option>
                <option value="buy">Buy Saja</option>
                <option value="sell">Sell Saja</option>
              </select>
              <Icon
                name="unfold_more"
                className="pointer-events-none absolute right-2 top-2 text-[16px] text-on-surface-variant"
              />
            </div>
            <div className="relative min-w-[220px] flex-1">
              <Icon
                name="search"
                className="absolute left-2.5 top-2 text-[18px] text-outline"
              />
              <input
                name="q"
                defaultValue={q}
                placeholder="Cari tiket atau simbol..."
                className="w-full rounded-xl bg-surface-container-low py-1.5 pl-8 pr-3 font-body-sm text-body-sm text-on-surface outline-none transition-all placeholder:text-outline focus:bg-surface-container-lowest"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Link
              href={`/history?acc=${account.id}`}
              className="rounded-xl px-3 py-1.5 font-body-sm text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            >
              Reset Filter
            </Link>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-1.5 font-label-tabular text-body-sm font-semibold text-on-secondary shadow-sm transition-colors hover:opacity-90"
            >
              <Icon name="filter_alt" className="text-[16px]" />
              Terapkan Filter
            </button>
          </div>
        </form>

        {/* Table */}
        <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="overflow-x-auto">
            {pageRows.length === 0 ? (
              <p className="py-12 text-center font-body-sm text-body-sm text-on-surface-variant">
                Tidak ada trade pada filter ini
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    <th className="px-4 py-3 font-semibold">Tiket</th>
                    <th className="px-4 py-3 font-semibold">Simbol</th>
                    <th className="px-3 py-3 text-center font-semibold">Tipe</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Lot{cent ? " (Std)" : ""}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">Harga Buka</th>
                    <th className="px-4 py-3 text-right font-semibold">Harga Tutup</th>
                    <th className="px-4 py-3 font-semibold">Waktu Tutup</th>
                    <th className="px-4 py-3 text-right font-semibold">Profit</th>
                    <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                    <th className="px-4 py-3 text-right font-semibold">Swap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-label-tabular text-body-sm">
                  {pageRows.map((r: HistoryRow) => (
                    <tr key={r.positionId} className="transition-colors hover:bg-surface-container-low/60">
                      <td className="tnum py-3 pl-4 pr-4 font-medium text-on-surface-variant">
                        {r.positionId}
                      </td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{r.symbol}</td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 font-label-caps text-label-caps font-bold ${
                            r.type === "buy"
                              ? "bg-secondary-container/40 text-secondary"
                              : "bg-tertiary-fixed text-on-tertiary-container"
                          }`}
                        >
                          {r.type === "buy" ? "BUY" : "SELL"}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-on-surface">
                        {fmtLots(r.volume, { cent })}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-on-surface">
                        {r.openPrice.toFixed(5)}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-on-surface">
                        {r.closePrice.toFixed(5)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                        {fmtDateTime(r.closeTime)}
                      </td>
                      <td
                        className={`tnum px-4 py-3 text-right font-bold ${
                          r.netProfit >= 0 ? "text-secondary" : "text-error"
                        }`}
                      >
                        {signed(r.netProfit)}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-on-surface-variant">
                        {fmtMoney(r.commission, { cent })}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-on-surface-variant">
                        {fmtMoney(r.swap, { cent })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-4 bg-surface-container-low px-4 py-3 sm:flex-row">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Menampilkan{" "}
              <span className="tnum font-label-tabular font-semibold text-on-surface">
                {from}-{to}
              </span>{" "}
              dari{" "}
              <span className="tnum font-label-tabular font-semibold text-on-surface">
                {rows.length}
              </span>{" "}
              trade tertutup
            </span>
            <div className="flex items-center gap-1">
              {safePage > 1 && (
                <Link
                  href={base({ ...filterState, page: String(safePage - 1) })}
                  className="rounded-lg bg-surface-container-lowest px-2.5 py-1 font-label-tabular text-body-sm text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  <Icon name="chevron_left" className="align-middle text-[16px]" />
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (n) =>
                    n === 1 ||
                    n === totalPages ||
                    Math.abs(n - safePage) <= 2
                )
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? (
                    <span key={`e${i}`} className="px-1 font-label-tabular text-body-sm font-medium text-on-surface-variant">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={base({ ...filterState, page: String(n) })}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg font-label-tabular text-body-sm shadow-sm transition-colors ${
                        n === safePage
                          ? "bg-primary font-semibold text-on-primary"
                          : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {n}
                    </Link>
                  )
                )}
              {safePage < totalPages && (
                <Link
                  href={base({ ...filterState, page: String(safePage + 1) })}
                  className="rounded-lg bg-surface-container-lowest px-2.5 py-1 font-label-tabular text-body-sm text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  <Icon name="chevron_right" className="align-middle text-[16px]" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
