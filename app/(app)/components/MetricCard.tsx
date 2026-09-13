import type { ReactNode } from "react";

export type Tone = "positive" | "negative" | "neutral";

const toneText: Record<Tone, string> = {
  positive: "text-secondary",
  negative: "text-on-tertiary-container",
  neutral: "text-on-surface",
};

/** Kartu metrik utama (bento KPI di dashboard). */
export default function MetricCard({
  label,
  topRight,
  footerLeft,
  footerRight,
  onClick,
  children,
}: {
  label: string;
  topRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const clickable = onClick != null;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`group flex flex-col justify-between rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-shadow sm:p-5 ${
        clickable
          ? "cursor-pointer hover:shadow-md focus-visible:outline-2 focus-visible:outline-secondary"
          : "hover:shadow-md"
      }`}
    >
      <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-label-caps text-label-caps uppercase tracking-wider">
          {label}
        </span>
        <span className="flex items-center gap-1">
          {clickable && (
            <span className="material-symbols-rounded text-[14px] opacity-0 transition-opacity group-hover:opacity-60">
              open_in_new
            </span>
          )}
          {topRight}
        </span>
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
