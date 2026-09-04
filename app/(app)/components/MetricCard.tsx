import type { ReactNode } from "react";

export type Tone = "positive" | "negative" | "neutral";

const toneText: Record<Tone, string> = {
  positive: "text-secondary",
  negative: "text-on-tertiary-container",
  neutral: "text-on-surface",
};

/** Kartu metrik utama (8 KPI bento di dashboard). */
export default function MetricCard({
  label,
  topRight,
  footerLeft,
  footerRight,
  children,
}: {
  label: string;
  topRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-5 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-label-caps text-label-caps uppercase tracking-wider">
          {label}
        </span>
        {topRight}
      </div>
      <div className="my-2.5">{children}</div>
      <div className="pt-1">
        {footerLeft || footerRight ? (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 font-body-sm text-body-sm text-on-surface-variant">
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
              {footerLeft}
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap">{footerRight}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MetricValue({
  value,
  tone = "neutral",
  className = "",
}: {
  value: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={`tnum font-metric-display text-metric-display tracking-tight ${toneText[tone]} ${className}`}
    >
      {value}
    </div>
  );
}
