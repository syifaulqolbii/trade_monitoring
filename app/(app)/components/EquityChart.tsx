"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/metrics";

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

export default function EquityChart({
  points,
  cent,
  currency,
}: {
  points: EquityPoint[];
  cent: boolean;
  currency?: string | null;
}) {
  const data = downsample(points).map((p) => ({
    t: new Date(p.t).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      ...(points.length > 400 ? {} : { year: "2-digit" }),
    }),
    Equity: cent ? p.equity / 100 : p.equity,
    Balance: cent ? p.balance / 100 : p.balance,
  }));

  const fmt = (v: number) =>
    v.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "#3f3f46" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
            tickFormatter={fmt}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value, name) => [
              fmt(Number(value)),
              String(name) === "Equity" ? "Equity" : "Balance",
            ]}
          />
          <Area
            type="monotone"
            dataKey="Balance"
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="none"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="Equity"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#eqGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {cent && (
        <p className="mt-1 text-right text-[11px] text-zinc-600">
          Nilai dikonversi USC → USD (÷100){currency ? ` · Mata uang akun: ${currency}` : ""}
        </p>
      )}
    </div>
  );
}