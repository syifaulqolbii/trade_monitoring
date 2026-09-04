"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/metrics";
import { toUsd } from "@/lib/metrics";

function downsample(points: EquityPoint[], max = 240): EquityPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: EquityPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[Math.floor(i)]);
  }
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

const fmtAxis = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function EquityChart({
  points,
  cent,
  currency,
}: {
  points: EquityPoint[];
  cent: boolean;
  currency?: string | null;
}) {
  const data = downsample(points).map((p) => {
    const mul = cent ? 100 : 1;
    return {
      t: p.t,
      Equity: Math.round(toUsd(p.equity, cent) * mul) / mul,
      Balance: Math.round(toUsd(p.balance, cent) * mul) / mul,
    };
  });

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const fmtTick = (t: number) =>
    new Date(t).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
    });

  if (data.length < 2) {
    return (
      <div className="flex h-[320px] w-full items-center justify-center text-body-sm text-on-surface-variant">
        Belum ada titik equity untuk rentang ini.
      </div>
    );
  }

  return (
    <div className="flex h-[320px] w-full flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#006c4a" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#006c4a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eff4ff" vertical={false} strokeWidth={1} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={fmtTick}
            tick={{ fill: "#76777d", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fill: "#76777d", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "0 4px 6px -1px rgba(15,23,42,0.06)",
            }}
            labelStyle={{ color: "#64748b", fontSize: 11 }}
            labelFormatter={(t) =>
              new Date(Number(t)).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            formatter={(value) => [fmt(Number(value)), undefined]}
          />
          <Line
            type="monotone"
            dataKey="Balance"
            stroke="#94a3b8"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
            name="Balance"
          />
          <Area
            type="monotone"
            dataKey="Equity"
            stroke="#006c4a"
            strokeWidth={2.25}
            fill="url(#eqGrad)"
            dot={false}
            name="Equity"
          />
        </ComposedChart>
      </ResponsiveContainer>
      {cent && (
        <p className="mt-1 text-right text-[11px] text-on-surface-variant">
          Nilai dikonversi USC → USD (÷100)
          {currency && currency !== "USD" ? ` · Mata uang akun: ${currency}` : ""}
        </p>
      )}
    </div>
  );
}
