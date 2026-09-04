import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listAccountsForPicker, resolveAccount } from "@/lib/queries";
import { fmtMoney, fmtLots, fmtDateTime } from "@/lib/format";
import Icon from "../components/Icon";

export const dynamic = "force-dynamic";

function timeAgo(d: Date | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export default async function PositionsPage({ searchParams }: PageProps<"/positions">) {
  const sp = await searchParams;
  const acc = Array.isArray(sp.acc) ? sp.acc[0] : sp.acc;
  const account = await resolveAccount(acc);
  const accounts = await listAccountsForPicker();

  if (!account || accounts.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-12 text-center shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
            <Icon name="candlestick_chart" className="text-[24px]" />
          </div>
          <h1 className="mt-4 font-headline-md text-headline-md font-semibold">
            Belum ada akun
          </h1>
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
            <Link href="/accounts" className="font-medium text-secondary underline">
              Tambah akun
            </Link>{" "}
            dulu.
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
      lastSyncAt: true,
    },
  });
  if (!accountFull) return null;

  const [positions, latestSnap] = await Promise.all([
    prisma.position.findMany({
      where: { accountId: account.id },
      orderBy: { openTime: "desc" },
    }),
    prisma.snapshot.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      select: { balance: true, equity: true, createdAt: true },
    }),
  ]);

  const cent = accountFull.cent;
  const floatingRaw = positions.reduce((s, p) => s + p.profit, 0);
  const totalSwap = positions.reduce((s, p) => s + (p.swap ?? 0), 0);
  const totalVolume = positions.reduce((s, p) => s + p.volume, 0);
  const signed = (v: number) => (v >= 0 ? "+" : "") + fmtMoney(v, { cent });
  const toneCls = (v: number) => (v >= 0 ? "text-secondary" : "text-on-tertiary-container");

  // eksposur per simbol
  const bySymbol = new Map<
    string,
    { symbol: string; count: number; volume: number; pnl: number }
  >();
  for (const p of positions) {
    const e = bySymbol.get(p.symbol) ?? { symbol: p.symbol, count: 0, volume: 0, pnl: 0 };
    e.count += 1;
    e.volume += p.volume;
    e.pnl += p.profit;
    bySymbol.set(p.symbol, e);
  }
  const exposures = [...bySymbol.values()].sort((a, b) => b.volume - a.volume);
  const maxVol = Math.max(1, ...exposures.map((e) => e.volume));

  const snapBalance = latestSnap?.balance ?? null;
  const snapEquity = latestSnap?.equity ?? null;
  const equityPct =
    snapEquity && snapEquity !== 0 ? (floatingRaw / snapEquity) * 100 : null;
  const loadPct =
    snapBalance && snapBalance !== 0
      ? Math.abs((floatingRaw / snapBalance) * 100)
      : null;

  return (
    <div className="w-full p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                Posisi Terbuka
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container/40 px-2.5 py-0.5 font-label-caps text-label-caps uppercase text-on-secondary-container">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" />
                Live Feed
              </span>
            </div>
            <p className="mt-1 flex items-center gap-2 font-body-md text-body-md text-on-surface-variant">
              <span className="font-medium text-on-surface">{accountFull.name}</span>
              <span>·</span>
              <span className="tnum font-label-tabular text-body-sm">
                {accountFull.login}
              </span>
              <span>·</span>
              <span className="tnum font-label-tabular text-body-sm">{accountFull.server}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/positions?acc=${account.id}`}
              className="flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3.5 py-2 font-label-tabular text-body-sm font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container-low"
            >
              <Icon name="sync" className="text-[18px] text-on-surface-variant" />
              Refresh Data
            </a>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Jumlah Posisi
              </span>
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-label-caps text-label-caps font-semibold text-on-surface">
                {positions.length} Tiket Aktif
              </span>
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className="tnum font-metric-display text-metric-display tracking-tight text-on-surface">
                {positions.length}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">orders</span>
            </div>
            <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
              <Icon
                name={positions.length > 0 ? "check_circle" : "info"}
                className={`text-[16px] ${positions.length > 0 ? "text-secondary" : ""}`}
              />
              <span>
                {positions.length > 0
                  ? "Bridge melaporkan posisi tiap siklus sinkron"
                  : "Belum ada posisi terbuka"}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Total Volume
              </span>
              <span className="rounded-full bg-surface-container-low px-2 py-0.5 font-label-caps text-label-caps font-medium text-on-surface-variant">
                {fmtLots(totalVolume, { cent })} Lot{cent ? " Std" : ""}
              </span>
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className="tnum font-metric-display text-metric-display tracking-tight text-on-surface">
                {fmtLots(totalVolume, { cent })}
              </span>
              <span className="font-body-lg font-medium text-on-surface-variant">
                lot standar
              </span>
            </div>
            <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>
                Simbol aktif:{" "}
                <strong className="tnum font-medium text-on-surface">
                  {exposures.length}
                </strong>
              </span>
              <span className="tnum font-label-tabular text-body-sm">
                {cent ? "Konversi cent → std (÷100)" : "Unit lot broker"}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Floating P&L
              </span>
              {equityPct != null && (
                <span
                  className={`rounded-full px-2 py-0.5 font-label-caps text-label-caps font-semibold ${
                    floatingRaw >= 0
                      ? "bg-secondary-container/40 text-on-secondary-container"
                      : "bg-error-container text-on-error-container"
                  }`}
                >
                  {equityPct.toFixed(2)}% Equity
                </span>
              )}
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className={`tnum font-metric-display text-metric-display tracking-tight ${toneCls(floatingRaw)}`}>
                {signed(floatingRaw)}
              </span>
              {cent && (
                <span className="tnum font-label-tabular text-body-sm text-on-surface-variant">
                  (~ {Math.abs(Math.round(floatingRaw)).toLocaleString("en-US")} USC)
                </span>
              )}
            </div>
            <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>
                Swap total:{" "}
                <span className="tnum font-label-tabular font-medium text-on-surface">
                  {fmtMoney(totalSwap, { cent })}
                </span>
              </span>
              <span className={`flex items-center font-medium ${toneCls(floatingRaw)}`}>
                <Icon
                  name={floatingRaw >= 0 ? "trending_up" : "trending_down"}
                  className="mr-0.5 text-[16px]"
                />
                {floatingRaw >= 0 ? "Profit mengambang" : "Drawdown mengambang"}
              </span>
            </div>
          </div>
        </div>

        {/* Info banner cent */}
        {cent && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
            <Icon name="info" className="shrink-0 text-[20px] text-secondary" />
            <p className="leading-relaxed">
              <strong className="font-semibold text-on-surface">Catatan Akun Cent:</strong>{" "}
              volume dikonversi ke lot standar (1.0 lot cent = 0.01 lot standar,
              spesifikasi kontrak 1 lot = 1.000 unit).
            </p>
          </div>
        )}

        {/* Table */}
        <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-1.5 text-on-surface">
                <Icon name="filter_list" className="text-[16px] text-on-surface-variant" />
                <span className="font-label-tabular text-body-sm font-medium">
                  {exposures.length === 1
                    ? `Semua Simbol (${exposures[0].symbol})`
                    : `Semua Simbol (${exposures.length})`}
                </span>
              </div>
              <span className="font-label-tabular text-body-sm text-on-surface-variant">
                |
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Sync terakhir:{" "}
                <strong className="tnum font-label-tabular text-on-surface">
                  {timeAgo(accountFull.lastSyncAt)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 font-label-tabular text-body-sm text-on-surface-variant">
              <span>Auto-refresh:</span>
              <span className="rounded bg-secondary-container/30 px-2 py-0.5 font-semibold text-on-secondary-container">
                via bridge ±30 dtk
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {positions.length === 0 ? (
              <p className="py-14 text-center font-body-sm text-body-sm text-on-surface-variant">
                Tidak ada posisi terbuka saat ini.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low/70 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    <th className="px-4 py-3.5 font-semibold">Ticket</th>
                    <th className="px-4 py-3.5 font-semibold">Simbol</th>
                    <th className="px-3 py-3.5 text-center font-semibold">Tipe</th>
                    <th className="px-4 py-3.5 text-right font-semibold">
                      Lot{cent ? " (Std)" : ""}
                    </th>
                    <th className="px-4 py-3.5 text-right font-semibold">Buka</th>
                    <th className="px-4 py-3.5 text-right font-semibold">Sekarang</th>
                    <th className="px-4 py-3.5 text-center font-semibold">SL / TP</th>
                    <th className="px-4 py-3.5 text-right font-semibold">Profit</th>
                    <th className="px-3 py-3.5 text-right font-semibold">Swap</th>
                    <th className="px-4 py-3.5 font-semibold">Dibuka</th>
                  </tr>
                </thead>
                <tbody className="font-label-tabular text-body-sm text-on-surface">
                  {positions.map((p, i) => {
                    const buy = p.type === 0;
                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors hover:bg-surface-container-low/50 ${
                          i % 2 === 1 ? "bg-surface-container-low/20" : ""
                        }`}
                      >
                        <td className="tnum px-4 py-3 font-medium text-on-surface-variant">
                          {p.ticket}
                        </td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{p.symbol}</td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                              buy
                                ? "bg-secondary-container text-on-secondary-container"
                                : "bg-tertiary-container text-on-tertiary"
                            }`}
                          >
                            {buy ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td className="tnum px-4 py-3 text-right font-medium">
                          {fmtLots(p.volume, { cent })}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-on-surface-variant">
                          {p.priceOpen.toFixed(5)}
                        </td>
                        <td className="tnum px-4 py-3 text-right font-semibold text-on-surface">
                          {p.priceCurrent.toFixed(5)}
                        </td>
                        <td className="tnum px-4 py-3 text-center text-on-surface-variant">
                          {p.sl != null ? p.sl.toFixed(5) : "0.00000"} /{" "}
                          {p.tp != null ? p.tp.toFixed(5) : "0.00000"}
                        </td>
                        <td
                          className={`tnum px-4 py-3 text-right font-bold ${
                            p.profit >= 0 ? "text-secondary" : "text-error"
                          }`}
                        >
                          {signed(p.profit)}
                        </td>
                        <td className="tnum px-3 py-3 text-right text-on-surface-variant">
                          {fmtMoney(p.swap ?? 0, { cent })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                          {fmtDateTime(p.openTime)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-container-low/80 font-label-tabular text-body-sm font-semibold text-on-surface">
                    <td colSpan={3} className="px-4 py-3.5">
                      <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                        Total Akumulasi ({positions.length} posisi)
                      </span>
                    </td>
                    <td className="tnum px-4 py-3.5 text-right">
                      {fmtLots(totalVolume, { cent })} lot
                    </td>
                    <td colSpan={3} className="px-4 py-3.5 text-center font-normal text-on-surface-variant">
                      Floating: {signed(floatingRaw)}
                    </td>
                    <td className={`tnum px-4 py-3.5 text-right font-bold ${toneCls(floatingRaw)}`}>
                      {signed(floatingRaw)}
                    </td>
                    <td className="tnum px-3 py-3.5 text-right">{fmtMoney(totalSwap, { cent })}</td>
                    <td className="px-4 py-3.5 text-right text-[11px] font-normal text-on-surface-variant">
                      Live
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Bottom panels */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Eksposur per simbol */}
          <div className="flex flex-col rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-body-md font-semibold text-on-surface">
                Eksposur per Simbol
              </span>
              <span className="font-label-caps text-label-caps uppercase text-secondary">
                Floating Terbuka
              </span>
            </div>
            {exposures.length === 0 ? (
              <p className="py-8 text-center font-body-sm text-body-sm text-on-surface-variant">
                Belum ada posisi untuk dianalisis.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                {exposures.map((e) => (
                  <div key={e.symbol} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between font-body-sm text-body-sm">
                      <div className="flex items-center gap-2">
                        <span className="tnum font-label-tabular font-bold text-on-surface">
                          {e.symbol}
                        </span>
                        <span className="font-label-caps text-[10px] text-on-surface-variant">
                          {e.count} pos · {fmtLots(e.volume, { cent })} lot
                          {cent ? " std" : ""}
                        </span>
                      </div>
                      <span className={`tnum font-label-tabular font-semibold ${toneCls(e.pnl)}`}>
                        {signed(e.pnl)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${(e.volume / maxVol) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 font-body-sm text-body-sm">
              <span className="text-on-surface-variant">
                Total volume terbuka
              </span>
              <span className="tnum font-label-tabular font-bold text-on-surface">
                {fmtLots(totalVolume, { cent })} lot{cent ? " standar" : ""}
              </span>
            </div>
          </div>

          {/* Ringkasan & ketahanan */}
          <div className="flex flex-col justify-between gap-3 rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-body-md font-semibold text-on-surface">
                Ringkasan Akun &amp; Ketahanan
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-label-caps text-label-caps font-bold ${
                  floatingRaw >= 0
                    ? "bg-secondary-container/40 text-on-secondary-container"
                    : "bg-error-container text-on-error-container"
                }`}
              >
                {floatingRaw >= 0 ? "AMAN" : "WASPADA"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Balance
                </span>
                <span className="tnum mt-0.5 font-label-tabular text-body-md font-semibold text-on-surface">
                  {snapBalance != null ? fmtMoney(snapBalance, { cent }) : "-"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Equity
                </span>
                <span className="tnum mt-0.5 font-label-tabular text-body-md font-semibold text-on-surface">
                  {snapEquity != null ? fmtMoney(snapEquity, { cent }) : "-"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Floating
                </span>
                <span className={`tnum mt-0.5 font-label-tabular text-body-md font-bold ${toneCls(floatingRaw)}`}>
                  {positions.length > 0 ? signed(floatingRaw) : "-"}
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center justify-between font-body-sm text-body-sm">
                <span className="text-on-surface-variant">
                  Beban floating terhadap balance
                </span>
                <span className="tnum font-label-tabular font-medium text-on-surface">
                  {loadPct != null ? `${loadPct.toFixed(2)}%` : "-"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
                <div
                  className={`h-2 rounded-full ${
                    floatingRaw >= 0 ? "bg-secondary" : "bg-error"
                  }`}
                  style={{ width: `${Math.min(100, loadPct ?? 0)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>Swap terakumulasi</span>
              <span className="tnum font-label-tabular text-on-surface">
                {fmtMoney(totalSwap, { cent })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
