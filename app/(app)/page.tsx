import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { loadAccountMetrics } from "@/lib/queries";
import { fmtMoney, fmtPct, fmtLots, monthLabel } from "@/lib/format";
import StatCard from "./components/StatCard";
import EquityChart from "./components/EquityChart";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) ?? undefined;

export default async function DashboardPage({
  searchParams,
}: PageProps<"/">) {
  const sp = await searchParams;
  const requestedId = first(sp.acc);

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, login: true },
  });

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <div className="text-4xl">🚀</div>
          <h1 className="mt-4 text-xl font-semibold">Belum ada akun</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Tambahkan akun MT5 kamu dulu, lalu jalankan bridge di VPS agar data mulai masuk.
          </p>
          <Link
            href="/accounts"
            className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            + Tambah Akun
          </Link>
        </div>
      </div>
    );
  }

  // pilih akun: dari query param, fallback akun pertama yang punya data
  const requested = accounts.find((a) => a.id === requestedId);
  let activeId = requested?.id ?? accounts[0].id;

  let data = await loadAccountMetrics(activeId);
  // fallback ke akun pertama yang punya snapshot bila akun terpilih belum ada data
  if ((!data || data.metrics.equityCurve.length === 0) && accounts.length > 1) {
    for (const a of accounts) {
      const alt = await loadAccountMetrics(a.id);
      if (alt && alt.metrics.equityCurve.length > 0) {
        data = alt;
        activeId = a.id;
        break;
      }
    }
  }

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

  if (!data || data.metrics.equityCurve.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <div className="text-3xl">📡</div>
          <h2 className="mt-3 text-lg font-semibold">Belum ada data sinkron</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
            Dashboard akan terisi setelah bridge Python di VPS mengirim data pertama.
            Ikuti panduan di{" "}
            <Link href="/accounts" className="text-emerald-400 underline">
              halaman Akun
            </Link>{" "}
            dan file{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
              bridge/README.md
            </code>
            .
          </p>
        </div>
      </div>
    );
  }

  const m = data.metrics;
  const cent = data.cent;
  const curMonth = new Date().toISOString().slice(0, 7);
  const curMonthStat = m.monthly.find((x) => x.month === curMonth);

  const pf =
    m.profitFactor == null
      ? "-"
      : m.profitFactor === Infinity
        ? "∞"
        : m.profitFactor.toFixed(2);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {data.name} · {data.broker} · {data.login} · {data.server}
            {data.lastSyncAt && (
              <span className="ml-2 text-emerald-500">
                ● Sinkron{" "}
                {new Date(data.lastSyncAt).toLocaleString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        {accounts.length > 1 && (
          <div className="flex gap-2">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/?acc=${a.id}`}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  a.id === active.id
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Equity"
          value={fmtMoney(m.equity, { cent })}
          sub={cent ? "USC → USD" : `Mata uang: ${data.currency ?? "USD"}`}
        />
        <StatCard
          label="Balance"
          value={fmtMoney(m.balance, { cent })}
          sub={`Deposit awal: ${fmtMoney(m.startBalance, { cent })}`}
        />
        <StatCard
          label="Growth"
          value={fmtPct(m.growthPct)}
          tone={m.growthPct >= 0 ? "positive" : "negative"}
          sub="Berdasar equity"
        />
        <StatCard
          label="Net Profit"
          value={fmtMoney(m.netProfit, { cent })}
          tone={m.netProfit >= 0 ? "positive" : "negative"}
          sub="Posisi tertutup"
        />
        <StatCard
          label="Max Drawdown"
          value={fmtPct(m.maxDrawdownPct)}
          tone="negative"
          sub={`Saat ini: ${fmtPct(m.currentDrawdownPct)}`}
        />
        <StatCard
          label="Win Rate"
          value={m.winRatePct != null ? `${m.winRatePct.toFixed(1)}%` : "-"}
          sub={`${m.totalTrades} trade tertutup`}
        />
        <StatCard label="Profit Factor" value={pf} sub="Gross profit / gross loss" />
        <StatCard
          label="Lots Bulan Ini"
          value={fmtLots(curMonthStat?.lots)}
          sub={`Total lot: ${fmtLots(m.totalLots)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Kurva Equity
          </h2>
          <EquityChart
            points={m.equityCurve}
            cent={cent}
            currency={data.currency}
          />
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Posisi Terbuka
          </h2>
          {data.openSummary.count === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-600">
              Tidak ada posisi terbuka
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Jumlah posisi</span>
                <span className="font-semibold">{data.openSummary.count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Total volume</span>
                <span className="font-semibold">
                  {fmtLots(data.openSummary.volume)} lot
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Floating P&L</span>
                <span
                  className={`font-semibold ${
                    data.openSummary.profit >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {fmtMoney(data.openSummary.profit, { cent })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Swap</span>
                <span className="font-semibold">
                  {fmtMoney(data.openSummary.swap, { cent })}
                </span>
              </div>
              <Link
                href="/positions"
                className="mt-2 block rounded-lg border border-zinc-700 py-2 text-center text-sm text-zinc-300 transition hover:border-zinc-500"
              >
                Lihat Detail →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Statistik Bulanan
        </h2>
        {m.monthly.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4 font-medium">Bulan</th>
                  <th className="pb-2 pr-4 text-right font-medium">Lots</th>
                  <th className="pb-2 pr-4 text-right font-medium">Trade</th>
                  <th className="pb-2 pr-4 text-right font-medium">Win Rate</th>
                  <th className="pb-2 pr-4 text-right font-medium">Profit</th>
                  <th className="pb-2 text-right font-medium">Balance Akhir</th>
                </tr>
              </thead>
              <tbody>
                {[...m.monthly].reverse().map((row) => (
                  <tr
                    key={row.month}
                    className="border-b border-zinc-800/60 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-medium text-zinc-200">
                      {monthLabel(row.month)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {fmtLots(row.lots)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.trades}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.winRate != null ? `${row.winRate.toFixed(1)}%` : "-"}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right font-medium tabular-nums ${
                        row.profit >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {fmtMoney(row.profit, { cent })}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {fmtMoney(row.balance, { cent })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-zinc-600">
            Belum ada trade tertutup
          </p>
        )}
      </div>
    </div>
  );
}