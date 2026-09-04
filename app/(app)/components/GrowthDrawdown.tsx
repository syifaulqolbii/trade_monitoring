"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { GrowthDDPoint } from "@/lib/metrics";

function downsample<T>(points: T[], max = 160): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[Math.floor(i)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function MiniArea({
  data,
  valueKey,
  gradId,
  stroke,
  prefix = "",
  label,
  value,
}: {
  data: GrowthDDPoint[];
  valueKey: "growthPct" | "ddPct";
  gradId: string;
  stroke: string;
  prefix?: string;
  label: string;
  value: string;
}) {
  const first = data[0]?.t;
  const last = data[data.length - 1]?.t;
  const fmtDate = (t: number | undefined) =>
    t
      ? new Date(t).toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between font-body-sm text-body-sm">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {label}
        </span>
        <span className="tnum font-label-tabular text-label-tabular font-bold text-on-tertiary-container">
          {prefix}
          {value}
        </span>
      </div>
      <div className="relative h-[92px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={stroke}
                  stopOpacity={valueKey === "ddPct" ? 0.22 : 0.1}
                />
                <stop
                  offset="100%"
                  stopColor={stroke}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <ReferenceLine
              y={0}
              stroke="#c6c6cd"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke={stroke}
              strokeWidth={1.75}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute -top-1 left-0.5 font-label-caps text-[9px] text-on-surface-variant">
          0.0% Baseline
        </div>
      </div>
      <div className="flex items-center justify-between font-label-caps text-[10px] text-on-surface-variant">
        <span>{fmtDate(first)}</span>
        <span>{fmtDate(last)}</span>
      </div>
    </div>
  );
}

export default function GrowthDrawdown({ points }: { points: GrowthDDPoint[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const data = downsample(points);
  const cur = data[data.length - 1];
  if (data.length < 2 || !cur) {
    return (
      <p className="py-6 text-center font-body-sm text-body-sm text-on-surface-variant">
        Belum ada data equity pada rentang ini.
      </p>
    );
  }

  const currentDD = Math.abs(cur.ddPct);

  return (
    <div className="flex flex-col gap-5">
      <MiniArea
        data={data}
        valueKey="growthPct"
        gradId={`grow-${uid}`}
        stroke="#006c4a"
        prefix=""
        label="Pertumbuhan Relatif (%)"
        value={`${cur.growthPct > 0 ? "+" : ""}${cur.growthPct.toFixed(2)}%`}
      />
      <div className="border-t border-outline-variant/20 pt-4">
        <MiniArea
          data={data}
          valueKey="ddPct"
          gradId={`dd-${uid}`}
          stroke="#ba1a1a"
          prefix=""
          label="Underwater Drawdown"
          value={`${currentDD.toFixed(2)}%`}
        />
      </div>
    </div>
  );
}
