"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint, GrowthDDPoint, SymbolStat } from "@/lib/metrics";
import { fmtLots, fmtMoney, fmtPct, monthLabel } from "@/lib/format";
import MetricCard, { MetricValue, type Tone } from "./MetricCard";
import EquityChart from "./EquityChart";
import GrowthDrawdown from "./GrowthDrawdown";

/* ============================================================
 * Data yang dikirim Server Page → grid kartu + modal detail
 * ============================================================ */

export interface CardMetrics {
  equity: number;
  balance: number;
  growthPct: number;
  netProfit: number;
  deposits: number;
  withdrawals: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  winRatePct: number | null;
  totalTrades: number;
  profitFactor: number | null;
  totalLots: number;
  lotsLabel: string;
  startBalance: number;
}

export interface MonthlyRow {
  month: string;
  lots: number;
  trades: number;
  winRate: number | null;
  profit: number;
}

export interface MetricCardsData {
  metrics: CardMetrics;
  /** rentang aktif (bukan ALL): series & bulanan ter-filter */
  monthly: MonthlyRow[];
  /** seluruh riwayat — dipakai modal supaya grafik kaya */
  monthlyAll: MonthlyRow[];
  equityCurve: EquityPoint[];
  growthDD: GrowthDDPoint[];
  symbolStats: SymbolStat[];
  cent: boolean;
  currency?: string | null;
  rangeLabel: string;
}

/* ============================================================
 * Modal detail
 * ============================================================ */

type ModalKey =
  | "equity"
  | "growth"
  | "netProfit"
  | "cashflow"
  | "drawdown"
  | "winRate"
  | "profitFactor"
  | "lots";

const MODAL_META: Record<
  ModalKey,
  { title: string; desc: string; icon: string }
> = {
  equity: {
    title: "Equity & Balance",
    desc: "Equity = balance + floating P&L posisi terbuka. Kurva menunjukkan keduanya dari snapshot berkala.",
    icon: "account_balance",
  },
  growth: {
    title: "Growth",
    desc: "Pertumbuhan equity relatif terhadap modal bersih terpasang, sudah dikoreksi deposit/withdrawal.",
    icon: "trending_up",
  },
  netProfit: {
    title: "Net Profit",
    desc: "Profit posisi tertutup, nett komisi, swap, dan fee. Bar hijau = bulan profit, merah = bulan rugi.",
    icon: "payments",
  },
  cashflow: {
    title: "Cash Flow",
    desc: "Total deposit & withdrawal (operasi balance) pada rentang aktif — bukan bagian dari growth.",
    icon: "account_balance_wallet",
  },
  drawdown: {
    title: "Drawdown",
    desc: "Penurunan equity dari puncak (peak). Bawah kurva merah = underwater drawdown per titik.",
    icon: "speed",
  },
  winRate: {
    title: "Win Rate",
    desc: "Persentase posisi tertutup yang profit > 0 (nett). Volume bar = lots yang diperdagangkan per bulan.",
    icon: "percent",
  },
  profitFactor: {
    title: "Profit Factor",
    desc: "Gross profit ÷ gross loss. >1 = profit mendominasi; ∞ = tanpa loss sama sekali. Grafik menunjukkan profit per bulan.",
    icon: "query_stats",
  },
  lots: {
    title: "Lots",
    desc: "Volume yang diperdagangkan (round-trip dihitung sekali). Bar menunjukkan aktivitas per bulan.",
    icon: "pie_chart",
  },
};

function fmtMonthlyBars(rows: MonthlyRow[], cent: boolean) {
  return rows.map((r) => ({
    month: monthLabel(r.month),
    Profit: r.profit,
    Lots: cent ? r.lots / 100 : r.lots,
    Trades: r.trades,
    pnl: r.profit >= 0,
  }));
}

const BAR_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 6px -1px rgba(15,23,42,0.06)",
} as const;

/** Bar bulanan profit — dipakai modal Net Profit & Profit Factor. */
function ProfitBars({ rows, cent }: { rows: MonthlyRow[]; cent: boolean }) {
  const data = fmtMonthlyBars(rows, cent);
  if (data.length === 0)
    return <EmptyChart text="Belum ada trade tertutup di rentang ini." />;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eff4ff" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "#76777d", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#76777d", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            contentStyle={BAR_TOOLTIP_STYLE}
            labelStyle={{ color: "#64748b", fontSize: 11 }}
            formatter={(v) => [fmtMoney(Number(v), { cent }), "Profit"] as [string, string]}
          />
          <Bar dataKey="Profit" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pnl ? "#006c4a" : "#ba1a1a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bar bulanan lots — dipakai modal Win Rate & Lots. */
function LotsBars({
  rows,
  cent,
  dataKey,
}: {
  rows: MonthlyRow[];
  cent: boolean;
  dataKey: "Lots" | "Trades";
}) {
  const data = fmtMonthlyBars(rows, cent);
  if (data.length === 0)
    return <EmptyChart text="Belum ada aktivitas di rentang ini." />;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eff4ff" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "#76777d", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#76777d", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={BAR_TOOLTIP_STYLE}
            labelStyle={{ color: "#64748b", fontSize: 11 }}
            formatter={(v, name) =>
              [
                String(v),
                name === "Lots" ? (cent ? "Lot (std)" : "Lots") : "Trade",
              ] as [string, string]
            }
          />
          <Bar dataKey={dataKey} fill="#006c4a" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-72 w-full items-center justify-center rounded-xl border border-dashed border-outline-variant/40 font-body-sm text-body-sm text-on-surface-variant">
      {text}
    </div>
  );
}

function DetailModal({
  which,
  data,
  onClose,
}: {
  which: ModalKey;
  data: MetricCardsData;
  onClose: () => void;
}) {
  const meta = MODAL_META[which];
  const m = data.metrics;

  // ESC untuk tutup + kunci scroll body
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const headline = (): string => {
    switch (which) {
      case "equity":
        return fmtMoney(m.equity, { cent: data.cent });
      case "growth":
        return fmtPct(m.growthPct);
      case "netProfit":
        return fmtMoney(m.netProfit, { cent: data.cent });
      case "cashflow":
        return `${fmtMoney(m.deposits, { cent: data.cent })} in / ${fmtMoney(m.withdrawals, { cent: data.cent })} out`;
      case "drawdown":
        return fmtPct(m.maxDrawdownPct, 2).replace("+", "");
      case "winRate":
        return m.winRatePct != null ? `${m.winRatePct.toFixed(1)}%` : "-";
      case "profitFactor":
        return m.profitFactor == null
          ? "-"
          : m.profitFactor === Infinity
            ? "∞"
            : m.profitFactor.toFixed(2);
      case "lots":
        return fmtLots(m.totalLots, { cent: data.cent });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/30 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary-container/50 text-on-secondary-container">
              <span className="material-symbols-rounded text-[20px]">{meta.icon}</span>
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-body-lg text-body-lg font-bold text-on-surface">
                {meta.title}
              </h2>
              <p className="tnum font-metric-display text-metric-display text-secondary">
                {headline()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
        </div>

        {/* konten */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">
            {meta.desc}
          </p>

          {which === "equity" && (
            <EquityChart
              points={data.equityCurve}
              cent={data.cent}
              currency={data.currency}
            />
          )}
          {which === "growth" && <GrowthDrawdown points={data.growthDD} />}
          {which === "drawdown" && <GrowthDrawdown points={data.growthDD} />}
          {which === "netProfit" && (
            <ProfitBars rows={data.monthlyAll} cent={data.cent} />
          )}
          {which === "profitFactor" && (
            <ProfitBars rows={data.monthlyAll} cent={data.cent} />
          )}
          {which === "cashflow" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Total Deposit
                </p>
                <p className="tnum mt-1 font-metric-display text-metric-display font-bold text-secondary">
                  {fmtMoney(m.deposits, { cent: data.cent })}
                </p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Modal masuk pada rentang {data.rangeLabel.toLowerCase()}
                </p>
              </div>
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Total Withdrawal
                </p>
                <p className="tnum mt-1 font-metric-display text-metric-display font-bold text-on-tertiary-container">
                  {fmtMoney(m.withdrawals, { cent: data.cent })}
                </p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Dana keluar pada rentang {data.rangeLabel.toLowerCase()}
                </p>
              </div>
            </div>
          )}
          {which === "winRate" && (
            <LotsBars rows={data.monthlyAll} cent={data.cent} dataKey="Trades" />
          )}
          {which === "lots" && (
            <LotsBars rows={data.monthlyAll} cent={data.cent} dataKey="Lots" />
          )}

          {/* strip konteks tambahan per kartu */}
          {which === "equity" && (
            <p className="mt-3 text-right font-label-caps text-[11px] text-on-surface-variant">
              Balance akhir: {fmtMoney(m.balance, { cent: data.cent })} · Deposit awal:{" "}
              {fmtMoney(m.startBalance, { cent: data.cent })}
            </p>
          )}
          {(which === "growth" || which === "drawdown") && (
            <p className="mt-3 text-right font-label-caps text-[11px] text-on-surface-variant">
              Drawdown saat ini: {fmtPct(m.currentDrawdownPct, 2).replace("+", "")} · Rentang: {data.rangeLabel}
            </p>
          )}
          {which === "winRate" && (
            <p className="mt-3 text-right font-label-caps text-[11px] text-on-surface-variant">
              {m.totalTrades} posisi tertutup · {data.rangeLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Grid kartu
 * ============================================================ */

export default function MetricCards({ data }: { data: MetricCardsData }) {
  const [open, setOpen] = useState<ModalKey | null>(null);
  const m = data.metrics;
  const cent = data.cent;

  const tone = (v: number): Tone => (v >= 0 ? "positive" : "negative");
  const floating = m.equity - m.balance;
  const winCount = Math.round(((m.winRatePct ?? 0) / 100) * m.totalTrades);
  const lossCount = m.totalTrades - winCount;
  const pf =
    m.profitFactor == null
      ? "-"
      : m.profitFactor === Infinity
        ? "∞"
        : m.profitFactor.toFixed(2);
  const pfBadge =
    m.profitFactor == null
      ? null
      : m.profitFactor >= 2
        ? { text: "Solid", tone: "positive" as Tone }
        : m.profitFactor >= 1.2
          ? { text: "Sehat", tone: "positive" as Tone }
          : m.profitFactor < 1
            ? { text: "Merugi", tone: "negative" as Tone }
            : { text: "Tipis", tone: "negative" as Tone };
  const healthBadge =
    m.winRatePct == null
      ? null
      : m.winRatePct >= 50
        ? { text: "Healthy", tone: "positive" as Tone }
        : { text: "Risiko", tone: "negative" as Tone };

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 lg:mb-8">
        {/* Equity (gabungan equity + balance) */}
        <MetricCard
          label="Equity"
          onClick={() => setOpen("equity")}
          topRight={
            cent ? (
              <span className="rounded bg-surface-container px-1.5 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
                USC → USD
              </span>
            ) : null
          }
          footerLeft={
            <span
              className={`flex items-center gap-1 font-medium ${
                floating >= 0 ? "text-secondary" : "text-on-tertiary-container"
              }`}
            >
              <span className="material-symbols-rounded text-[14px]">
                {floating >= 0 ? "trending_up" : "trending_down"}
              </span>
              {fmtMoney(floating, { cent })} floating
            </span>
          }
          footerRight={
            <span>
              Balance:{" "}
              <span className="tnum font-label-tabular font-medium text-on-surface">
                {fmtMoney(m.balance, { cent })}
              </span>
            </span>
          }
        >
          <MetricValue value={fmtMoney(m.equity, { cent })} />
        </MetricCard>

        {/* Growth */}
        <MetricCard
          label="Growth"
          onClick={() => setOpen("growth")}
          topRight={
            <span className="rounded bg-tertiary-fixed px-1.5 py-0.5 font-label-caps text-label-caps font-semibold text-on-tertiary-container">
              {data.rangeLabel}
            </span>
          }
          footerLeft={<span>Berdasar equity</span>}
          footerRight={
            <span className="material-symbols-rounded text-[14px] text-outline">
              show_chart
            </span>
          }
        >
          <MetricValue value={fmtPct(m.growthPct)} tone={tone(m.growthPct)} />
        </MetricCard>

        {/* Net Profit */}
        <MetricCard
          label="Net Profit"
          onClick={() => setOpen("netProfit")}
          topRight={
            <span
              className={`h-2 w-2 rounded-full ${
                m.netProfit >= 0 ? "bg-secondary" : "bg-error"
              }`}
            />
          }
          footerLeft={<span>Posisi tertutup</span>}
          footerRight={
            <span
              className={`tnum font-label-tabular font-semibold ${
                m.netProfit >= 0 ? "text-secondary" : "text-on-tertiary-container"
              }`}
            >
              {m.totalTrades} posisi
            </span>
          }
        >
          <MetricValue
            value={fmtMoney(m.netProfit, { cent })}
            tone={tone(m.netProfit)}
          />
        </MetricCard>

        {/* Cash Flow */}
        <MetricCard
          label="Cash Flow"
          onClick={() => setOpen("cashflow")}
          topRight={
            <span className="material-symbols-rounded text-[16px] text-outline">
              account_balance_wallet
            </span>
          }
          footerLeft={
            <span className="flex items-center gap-1 font-medium text-secondary">
              <span className="material-symbols-rounded text-[14px]">
                trending_up
              </span>
              {fmtMoney(m.deposits, { cent })}
            </span>
          }
          footerRight={
            <span className="flex items-center gap-1 font-medium text-error">
              <span className="material-symbols-rounded text-[14px]">
                trending_down
              </span>
              {fmtMoney(m.withdrawals, { cent })}
            </span>
          }
        >
          <MetricValue
            value={fmtMoney(m.deposits, { cent })}
            tone={tone(m.deposits)}
          />
        </MetricCard>

        {/* Max Drawdown */}
        <MetricCard
          label="Max Drawdown"
          onClick={() => setOpen("drawdown")}
          topRight={
            <span className="material-symbols-rounded text-[16px] text-outline">
              speed
            </span>
          }
          footerLeft={<span>Saat ini:</span>}
          footerRight={
            <span className="tnum font-label-tabular font-medium text-on-surface">
              {fmtPct(m.currentDrawdownPct, 2).replace("+", "")}
            </span>
          }
        >
          <MetricValue value={fmtPct(m.maxDrawdownPct, 2).replace("+", "")} />
        </MetricCard>

        {/* Win Rate */}
        <MetricCard
          label="Win Rate"
          onClick={() => setOpen("winRate")}
          topRight={
            <span
              className={`tnum font-label-tabular font-medium ${
                m.winRatePct != null && m.winRatePct >= 50
                  ? "text-secondary"
                  : "text-on-tertiary-container"
              }`}
            >
              {m.winRatePct != null ? `${winCount}/${m.totalTrades}` : "—"}
            </span>
          }
          footerLeft={
            <span>
              {winCount}W / {lossCount}L
            </span>
          }
          footerRight={
            healthBadge ? (
              <span
                className={`font-label-caps text-label-caps font-semibold ${
                  healthBadge.tone === "positive"
                    ? "text-secondary"
                    : "text-on-tertiary-container"
                }`}
              >
                {healthBadge.text}
              </span>
            ) : null
          }
        >
          <div className="flex items-center justify-between gap-2">
            <MetricValue
              value={m.winRatePct != null ? `${m.winRatePct.toFixed(1)}%` : "-"}
            />
            <div className="h-2 w-14 overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full bg-secondary"
                style={{
                  width: `${Math.min(100, Math.max(0, m.winRatePct ?? 0))}%`,
                }}
              />
            </div>
          </div>
        </MetricCard>

        {/* Profit Factor */}
        <MetricCard
          label="Profit Factor"
          onClick={() => setOpen("profitFactor")}
          topRight={
            <span className="material-symbols-rounded text-[16px] text-outline">
              query_stats
            </span>
          }
          footerLeft={<span>Gross profit / gross loss</span>}
          footerRight={
            pfBadge ? (
              <span
                className={`font-label-caps text-label-caps font-semibold ${
                  pfBadge.tone === "positive"
                    ? "text-secondary"
                    : "text-on-tertiary-container"
                }`}
              >
                {pfBadge.text}
              </span>
            ) : null
          }
        >
          <MetricValue value={pf} />
        </MetricCard>

        {/* Lots */}
        <MetricCard
          label={m.lotsLabel}
          onClick={() => setOpen("lots")}
          topRight={
            <span className="material-symbols-rounded text-[16px] text-outline">
              pie_chart
            </span>
          }
          footerLeft={<span>Aktivitas per bulan</span>}
          footerRight={
            <span className="material-symbols-rounded text-[14px] text-outline">
              bar_chart
            </span>
          }
        >
          <MetricValue value={fmtLots(m.totalLots, { cent })} />
        </MetricCard>
      </div>

      {open && (
        <DetailModal which={open} data={data} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
