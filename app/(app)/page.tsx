import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadAccountMetrics } from "@/lib/queries";
import { fmtMoney, fmtPct, fmtLots, monthLabel } from "@/lib/format";
import Icon from "./components/Icon";
import EquityChart from "./components/EquityChart";
import GrowthDrawdown from "./components/GrowthDrawdown";
import DashboardActions, { type DashboardSnapshotData } from "./components/DashboardActions";
import MetricCards from "./components/MetricCards";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) ?? undefined;

type RangeKey = "day" | "week" | "month" | "all";

const RANGES: { key: RangeKey; label: string; badge: string }[] = [
  { key: "day", label: "Hari Ini", badge: "1D" },
  { key: "week", label: "Minggu Ini", badge: "7D" },
  { key: "month", label: "Bulan Ini", badge: "MTD" },
  { key: "all", label: "Semua", badge: "ALL" },
];

/** awal rentang (waktu lokal server): dayâ†’00:00 hari ini, weekâ†’7 hari, monthâ†’awal bulan */
function rangeStartMs(key: RangeKey): number | undefined {
  const now = new Date();
  if (key === "all") return undefined;
  if (key === "day") {
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }
  if (key === "week") return now.getTime() - 7 * 24 * 3600 * 1000;
  // month
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function parseRange(v: string | undefined): RangeKey {
  if (v === "day" || v === "week" || v === "month" || v === "all") return v;
  return "month";
}

const emptyStyle =
  "mx-auto max-w-3xl rounded-xl bg-surface-container-lowest p-12 text-center shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] border border-outline-variant/30";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/">) {
  const sp = await searchParams;
  const requestedId = first(sp.acc);
  const range = parseRange(first(sp.range));
  const sinceMs = rangeStartMs(range);

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, login: true },
  });

  if (accounts.length === 0) {
    return (
      <div className="px-6">
        <div className={emptyStyle}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
            <Icon name="rocket_launch" className="text-[24px]" />
          </div>
          <h1 className="mt-4 font-headline-md text-headline-md font-semibold">
            Belum ada akun
          </h1>
          <p className="mx-auto mt-2 max-w-md font-body-sm text-body-sm text-on-surface-variant">
            Tambahkan akun MT5 kamu dulu, lalu jalankan bridge di VPS agar data
            mulai masuk.
          </p>
          <Link
            href="/accounts"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-body-md text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            <Icon name="add" className="text-[16px]" />
            Tambah Akun
          </Link>
        </div>
      </div>
    );
  }

  // ---- pilih akun aktif ----
  const requested = accounts.find((a) => a.id === requestedId);
  let activeId = requested?.id ?? accounts[0].id;

  // cek data penuh (tanpa rentang) untuk fallback akun pertama yang berisi data
  let allData = await loadAccountMetrics(activeId);
  if ((!allData || allData.metrics.equityCurve.length === 0) && accounts.length > 1) {
    for (const a of accounts) {
      const alt = await loadAccountMetrics(a.id);
      if (alt && alt.metrics.equityCurve.length > 0) {
        allData = alt;
        activeId = a.id;
        break;
      }
    }
  }
  if (requestedId && activeId !== requestedId) {
    redirect(`/?acc=${activeId}`);
  }
  if (!allData) return null;
  const cent = allData.cent;
  const accMeta = allData.raw;
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

  if (allData.metrics.equityCurve.length === 0) {
    return (
      <div className="px-6">
        <div className={emptyStyle}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
            <Icon name="sensors" className="text-[24px]" />
          </div>
          <h2 className="mt-4 font-headline-md text-headline-md font-semibold">
            Belum ada data sinkron
          </h2>
          <p className="mx-auto mt-2 max-w-lg font-body-sm text-body-sm text-on-surface-variant">
            Dashboard akan terisi setelah bridge Python di VPS mengirim data
            pertama. Ikuti panduan di{" "}
            <Link href="/accounts" className="font-medium text-secondary underline">
              halaman Akun
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  // ---- data rentang (untuk kartu & kurva) ----
  const windowData =
    sinceMs === undefined
      ? allData
      : ((await loadAccountMetrics(activeId, sinceMs)) ?? allData);

  const m = windowData.metrics;
  const mAll = allData.metrics;
  const hasRangeData = windowData.metrics.equityCurve.length > 0;

  const positions = await prisma.position.findMany({
    where: { accountId: activeId },
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
  });

  const lotsLabel = {
    day: "Lots Hari Ini",
    week: "Lots Minggu Ini",
    month: "Lots Bulan Ini",
    all: "Total Lots",
  }[range];

  const winCount = Math.round(((m.winRatePct ?? 0) / 100) * m.totalTrades);
  const lossCount = m.totalTrades - winCount;

  const open = windowData.openSummary;
  const chartPoints = windowData.metrics.equityCurve;
  const chartFirst = chartPoints[0]?.t;
  const chartLast = chartPoints[chartPoints.length - 1]?.t;
  const fmtStamp = (t?: number) =>
    t
      ? new Date(t).toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const chartCaption =
    chartFirst && chartLast ? `${fmtStamp(chartFirst)} â€” ${fmtStamp(chartLast)}` : "";

  const newest = positions.slice(0, 3);

  const rangeHref = (k: RangeKey) => {
    const p = new URLSearchParams();
    if (k !== "month") p.set("range", k);
    if (active) p.set("acc", active.id);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  const snapshot: DashboardSnapshotData = {
    account: {
      name: allData.name,
      broker: allData.broker,
      login: allData.login,
      server: allData.server ?? "",
      cent,
    },
    rangeLabel: RANGES.find((r) => r.key === range)?.label ?? "Bulan Ini",
    metrics: {
      balance: m.balance,
      equity: m.equity,
      netProfit: m.netProfit,
      growthPct: m.growthPct,
      winRatePct: m.winRatePct,
      profitFactor: m.profitFactor,
      totalTrades: m.totalTrades,
      lots: m.totalLots,
    },
    monthly: mAll.monthly.map((r) => ({
      month: r.month,
      lots: r.lots,
      trades: r.trades,
      winRate: r.winRate,
      profit: r.profit,
      balance: r.balance ?? 0,
    })),
    growth: allData.growthDD.map((g) => ({
      t: g.t,
      growthPct: g.growthPct,
      ddPct: g.ddPct,
    })),
  };

  return (
    <div className="w-full px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col">
        {/* Page sub-header */}
        <div className="flex flex-col justify-between gap-3 pb-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile tracking-tight text-on-surface sm:font-headline-lg sm:text-headline-lg">
                Dashboard Telemetri
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-2.5 py-0.5 font-label-caps text-label-caps text-on-secondary-container">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" />
                Live Feed
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-2 truncate font-body-sm text-body-sm text-on-surface-variant sm:font-body-md sm:text-body-md">
              <span className="font-medium text-on-surface">{allData.name}</span>
              <span className="h-1 w-1 rounded-full bg-outline-variant" />
              <span className="tnum font-label-tabular text-label-tabular font-medium text-on-surface">
                {allData.login}
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-outline-variant sm:inline" />
              <span className="hidden sm:inline">{allData.server}</span>
            </p>
          </div>

          {/* Timeframe tabs + snapshot */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-fit items-center gap-1 rounded-lg bg-surface-container p-1 sm:gap-1.5">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={rangeHref(r.key)}
                  className={`rounded px-3 py-1 font-label-caps text-label-caps transition-colors ${
                    range === r.key
                      ? "bg-surface-container-lowest text-on-surface shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <DashboardActions snapshot={snapshot} />
          </div>
        </div>

        {/* Info banner akun cent */}
        {cent && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-container-low px-4 py-2.5 sm:px-5 sm:mb-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon name="info" className="shrink-0 text-[18px] text-on-surface-variant" />
              <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                <strong className="font-semibold text-on-surface">Akun cent:</strong>{" "}
                uang Ã·100 (USC â†’ USD) dan lot Ã·100 â†’ lot standar (1.0 lot cent =
                0.01 lot standar, kontrak 1 lot = 1.000 unit).
              </span>
            </div>
            <span className="hidden whitespace-nowrap pl-4 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant sm:inline-flex">
              Audit MT5 Node
            </span>
          </div>
        )}

        {!hasRangeData ? (
          <div className={emptyStyle}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
              <Icon name="event_busy" className="text-[24px]" />
            </div>
            <h2 className="mt-4 font-headline-md text-headline-md font-semibold">
              Tidak ada aktivitas pada rentang ini
            </h2>
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
              Coba pilih rentang waktu lain.
            </p>
          </div>
        ) : (
          <>
            {/* Metric cards — klik untuk detail + grafik */}
            <MetricCards
              data={{
                metrics: {
                  equity: m.equity,
                  balance: m.balance,
                  growthPct: m.growthPct,
                  netProfit: m.netProfit,
                  deposits: m.deposits,
                  withdrawals: m.withdrawals,
                  maxDrawdownPct: m.maxDrawdownPct,
                  currentDrawdownPct: m.currentDrawdownPct,
                  winRatePct: m.winRatePct,
                  totalTrades: m.totalTrades,
                  profitFactor: m.profitFactor,
                  totalLots: m.totalLots,
                  lotsLabel,
                  startBalance: m.startBalance,
                },
                monthly: m.monthly.map((r) => ({
                  month: r.month,
                  lots: r.lots,
                  trades: r.trades,
                  winRate: r.winRate,
                  profit: r.profit,
                })),
                monthlyAll: mAll.monthly.map((r) => ({
                  month: r.month,
                  lots: r.lots,
                  trades: r.trades,
                  winRate: r.winRate,
                  profit: r.profit,
                })),
                equityCurve: windowData.metrics.equityCurve,
                growthDD: windowData.growthDD,
                symbolStats: windowData.symbolStats,
                cent,
                currency: accMeta?.currency,
                rangeLabel: RANGES.find((r) => r.key === range)?.label ?? "Bulan Ini",
              }}
            />
            {/* Chart + Posisi Terbuka */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
                {/* Equity chart */}
                <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-6 xl:col-span-8">
                  <div className="flex flex-col justify-between gap-3 border-b border-outline-variant/20 pb-5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-headline-md text-body-lg font-bold tracking-tight text-on-surface sm:font-semibold sm:text-headline-md">
                          Kurva Telemetri: Equity vs Balance
                        </span>
                        <span className="rounded bg-surface-container px-2 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
                          {RANGES.find((r) => r.key === range)?.label}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {chartCaption}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-body-sm text-body-sm text-on-surface-variant sm:gap-4 sm:pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-0.5 w-3 rounded-full bg-on-surface opacity-50" />
                        <span className="font-medium text-on-surface">
                          Balance ({fmtMoney(m.balance, { cent })})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1 w-3 rounded-full bg-secondary" />
                        <span className="font-semibold text-secondary">
                          Equity ({fmtMoney(m.equity, { cent })})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <EquityChart points={chartPoints} cent={cent} currency={accMeta?.currency} />
                  </div>
                </div>

                {/* Posisi Terbuka panel */}
                <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-6 xl:col-span-4">
                  <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-headline-md text-body-lg font-bold tracking-tight text-on-surface sm:font-semibold sm:text-headline-md">
                        Posisi Terbuka
                      </span>
                      <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-label-caps text-label-caps font-bold text-on-tertiary-container">
                        {open.count} Aktif
                      </span>
                    </div>
                    <Icon name="candlestick_chart" className="text-[20px] text-outline" />
                  </div>
                  <div className="space-y-2 py-3 font-body-sm text-body-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant">Jumlah posisi</span>
                      <span className="tnum font-label-tabular text-label-tabular font-bold text-on-surface">
                        {open.count} tiket
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant">Total volume</span>
                      <span className="tnum font-label-tabular text-label-tabular font-medium text-on-surface">
                        {fmtLots(open.volume, { cent })}
                        {cent ? " lot standar" : " lot"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant">Floating P&L</span>
                      <span
                        className={`tnum font-label-tabular text-label-tabular font-bold ${
                          open.profit >= 0 ? "text-secondary" : "text-on-tertiary-container"
                        }`}
                      >
                        {fmtMoney(open.profit, { cent })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-on-surface-variant">Swap Terakumulasi</span>
                      <span className="tnum font-label-tabular text-label-tabular font-medium text-on-surface">
                        {fmtMoney(open.swap, { cent })}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 border-t border-outline-variant/20 pt-3">
                    <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                      Tiket Terbaru
                    </span>
                    {newest.length === 0 ? (
                      <p className="py-4 text-center font-body-sm text-body-sm text-on-surface-variant">
                        Tidak ada posisi terbuka saat ini
                      </p>
                    ) : (
                      newest.map((p) => {
                        const buy = p.type === 0;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg bg-surface-container-low p-2.5 transition-colors hover:bg-surface-container"
                          >
                            <div className="flex min-w-0 flex-col">
                              <div className="flex items-center gap-2">
                                <span className="tnum font-label-tabular text-label-tabular font-bold text-on-surface">
                                  {p.symbol}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-label-caps text-[10px] ${
                                    buy
                                      ? "bg-secondary-container text-on-secondary-container"
                                      : "bg-tertiary-container text-on-tertiary"
                                  }`}
                                >
                                  {buy ? "BUY" : "SELL"} {fmtLots(p.volume, { cent })}
                                </span>
                              </div>
                              <span className="truncate text-[11px] font-body-sm text-on-surface-variant">
                                Open: {p.priceOpen.toFixed(5)}
                                {p.sl != null ? ` â€¢ SL: ${p.sl.toFixed(5)}` : ""}
                                {p.tp != null ? ` â€¢ TP: ${p.tp.toFixed(5)}` : ""}
                              </span>
                            </div>
                            <div className="ml-2 shrink-0 text-right">
                              <span
                                className={`tnum font-label-tabular text-label-tabular font-bold ${
                                  p.profit >= 0 ? "text-secondary" : "text-on-tertiary-container"
                                }`}
                              >
                                {fmtMoney(p.profit, { cent })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <Link
                    href={`/positions?acc=${activeId}`}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-body-md text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container"
                  >
                    Lihat Detail
                    <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
                </div>
              </div>

              {/* Growth + Drawdown & Distribusi Simbol */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-6">
                  <div className="flex flex-col justify-between gap-2 border-b border-outline-variant/20 pb-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-headline-md text-body-lg font-bold tracking-tight text-on-surface sm:font-semibold sm:text-headline-md">
                        Pertumbuhan &amp; Drawdown
                      </span>
                      <span className="rounded bg-tertiary-fixed px-2 py-0.5 font-label-caps text-label-caps font-semibold text-on-tertiary-container">
                        Underwater View
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-body-sm text-label-tabular">
                      <span className="font-semibold text-secondary">
                        Max {fmtPct(m.growthPct)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-3">
                    <GrowthDrawdown points={windowData.growthDD} />
                  </div>
                </div>

                <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-6">
                  <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-headline-md text-body-lg font-bold tracking-tight text-on-surface sm:font-semibold sm:text-headline-md">
                        Distribusi &amp; Performa Simbol
                      </span>
                      <span className="rounded bg-surface-container px-2 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
                        Volume &amp; PnL
                      </span>
                    </div>
                    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                      {m.totalTrades} Trade Tertutup
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 pt-4">
                    {windowData.symbolStats.length === 0 ? (
                      <p className="py-6 text-center font-body-sm text-body-sm text-on-surface-variant">
                        Belum ada trade tertutup di rentang ini.
                      </p>
                    ) : (
                      windowData.symbolStats.map((s) => (
                        <div key={s.symbol} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between font-body-sm text-body-sm">
                            <div className="flex items-center gap-2">
                              <span className="tnum font-label-tabular text-label-tabular font-bold text-on-surface">
                                {s.symbol}
                              </span>
                              <span className="font-label-caps text-[10px] text-on-surface-variant">
                                {fmtLots(s.lots, { cent })} lot (
                                {s.volumeShare.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`tnum font-label-tabular text-label-tabular font-semibold ${
                                  s.pnl >= 0
                                    ? "text-secondary"
                                    : "text-on-tertiary-container"
                                }`}
                              >
                                {fmtMoney(s.pnl, { cent })}
                              </span>
                              {s.winRate != null && (
                                <span
                                  className={`rounded px-1.5 py-0.5 font-label-caps text-[10px] ${
                                    s.winRate >= 50
                                      ? "bg-secondary-container/40 text-secondary"
                                      : "bg-tertiary-fixed text-on-tertiary-container"
                                  }`}
                                >
                                  {s.winRate.toFixed(0)}% Win
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container">
                            <div
                              className="h-full rounded-full bg-secondary"
                              style={{ width: `${Math.max(0, Math.min(100, s.winRate ?? 0))}%` }}
                            />
                            <div
                              className="h-full rounded-full bg-error-container"
                              style={{
                                width: `${s.winRate != null ? 100 - Math.min(100, s.winRate) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 font-body-sm text-body-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-secondary" />
                        <span className="font-label-caps text-[11px] text-on-surface-variant">
                          Win Trades ({winCount})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-error-container" />
                        <span className="font-label-caps text-[11px] text-on-surface-variant">
                          Loss Trades ({lossCount})
                        </span>
                      </div>
                    </div>
                    <span className="tnum font-label-tabular text-label-tabular font-bold text-on-surface">
                      Total PnL: {fmtMoney(m.netProfit, { cent })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statistik bulanan (seluruh riwayat) */}
              <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] sm:p-6">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="calendar_month" className="text-[20px] text-on-surface-variant" />
                    <span className="font-headline-md text-body-lg font-bold tracking-tight text-on-surface sm:font-semibold sm:text-headline-md">
                      Statistik Bulanan
                    </span>
                  </div>
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    Seluruh riwayat
                  </span>
                </div>
                {mAll.monthly.length > 0 ? (
                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                          <th className="py-3 pr-4 font-semibold">Bulan</th>
                          <th className="py-3 pr-4 text-right font-semibold">
                            Lots{cent ? " (std)" : ""}
                          </th>
                          <th className="py-3 pr-4 text-right font-semibold">Trade</th>
                          <th className="py-3 pr-4 text-right font-semibold">Win Rate</th>
                          <th className="py-3 pr-4 text-right font-semibold">Profit</th>
                          <th className="py-3 text-right font-semibold">Balance Akhir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-container-low font-label-tabular text-body-sm">
                        {[...mAll.monthly].reverse().map((row) => (
                          <tr key={row.month} className="hover:bg-surface-container-low/50">
                            <td className="py-3 pr-4 font-medium text-on-surface">
                              {monthLabel(row.month)}
                            </td>
                            <td className="tnum py-3 pr-4 text-right">
                              {fmtLots(row.lots, { cent })}
                            </td>
                            <td className="tnum py-3 pr-4 text-right">{row.trades}</td>
                            <td className="tnum py-3 pr-4 text-right">
                              {row.winRate != null ? `${row.winRate.toFixed(1)}%` : "-"}
                            </td>
                            <td
                              className={`tnum py-3 pr-4 text-right font-medium ${
                                row.profit >= 0 ? "text-secondary" : "text-on-tertiary-container"
                              }`}
                            >
                              {fmtMoney(row.profit, { cent })}
                            </td>
                            <td className="tnum py-3 text-right">
                              {fmtMoney(row.balance, { cent })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-6 text-center font-body-sm text-body-sm text-on-surface-variant">
                    Belum ada trade tertutup.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
