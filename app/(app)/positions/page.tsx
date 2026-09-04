import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listAccountsForPicker, resolveAccount } from "@/lib/queries";
import { fmtMoney, fmtLots, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage({ searchParams }: PageProps<"/positions">) {
  const sp = await searchParams;
  const acc = Array.isArray(sp.acc) ? sp.acc[0] : sp.acc;
  const account = await resolveAccount(acc);
  const accounts = await listAccountsForPicker();

  if (!account || accounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <div className="text-3xl">📭</div>
          <h1 className="mt-3 text-lg font-semibold">Belum ada akun</h1>
          <p className="mt-2 text-sm text-zinc-500">
            <Link href="/accounts" className="text-emerald-400 underline">Tambah akun</Link> dulu.
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

  const positions = await prisma.position.findMany({
    where: { accountId: account.id },
    orderBy: { openTime: "desc" },
  });

  const cent = accountFull.cent;
  const totalProfit = positions.reduce((s, p) => s + p.profit, 0);
  const totalSwap = positions.reduce((s, p) => s + (p.swap ?? 0), 0);
  const totalVolume = positions.reduce((s, p) => s + p.volume, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Posisi Terbuka</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {accountFull.name} · {accountFull.broker} · {accountFull.login} · {accountFull.server}
          </p>
        </div>
        {accounts.length > 1 && (
          <div className="flex gap-2">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/positions?acc=${a.id}`}
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

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Jumlah Posisi</div>
          <div className="mt-1 text-xl font-semibold">{positions.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total Volume</div>
          <div className="mt-1 text-xl font-semibold">
            {fmtLots(totalVolume, { cent })} {cent ? "lot standar" : "lot"}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Floating P&L</div>
          <div className={`mt-1 text-xl font-semibold ${totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtMoney(totalProfit, { cent })}
          </div>
        </div>
      </div>

      {cent && (
        <p className="mb-3 text-xs text-zinc-600">
          Akun cent: volume ditampilkan dalam <b>lot standar</b> (1.0 lot cent =
          0.01 lot standar, kontrak 1 lot = 1.000 unit).
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        {positions.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            Tidak ada posisi terbuka saat ini
          </p>
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
                <th className="px-4 py-3 text-right font-medium">Buka</th>
                <th className="px-4 py-3 text-right font-medium">Sekarang</th>
                <th className="px-4 py-3 text-right font-medium">SL / TP</th>
                <th className="px-4 py-3 text-right font-medium">Profit</th>
                <th className="px-4 py-3 text-right font-medium">Swap</th>
                <th className="px-4 py-3 font-medium">Dibuka</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{p.ticket}</td>
                  <td className="px-4 py-2.5 font-medium">{p.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        p.type === 0
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {p.type === 0 ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtLots(p.volume, { cent })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.priceOpen.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.priceCurrent.toFixed(5)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                    {p.sl != null ? p.sl.toFixed(5) : "-"} / {p.tp != null ? p.tp.toFixed(5) : "-"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      p.profit >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fmtMoney(p.profit, { cent })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                    {fmtMoney(p.swap ?? 0, { cent })}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtDateTime(p.openTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalSwap !== 0 && (
        <p className="mt-3 text-right text-xs text-zinc-600">
          Total swap: {fmtMoney(totalSwap, { cent })}
        </p>
      )}
    </div>
  );
}