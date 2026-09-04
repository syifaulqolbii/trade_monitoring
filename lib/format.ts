import { toUsd } from "./metrics";

/** Format angka uang; cent=true → tampilkan dalam USD (USC/100). */
export function fmtMoney(
  v: number | null | undefined,
  opts: { cent?: boolean; digits?: number; symbol?: string } = {}
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const cent = opts.cent ?? false;
  const digits = opts.digits ?? (cent ? 2 : 2);
  const usd = toUsd(v, cent);
  const symbol = opts.symbol ?? (cent ? "$" : "$");
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  return `${sign}${symbol}${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Format persen, mis. +12.34% */
export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

/** Format lot, mis. 1.25 */
export function fmtLots(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const ID_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export function fmtDate(d: Date | string | number | null | undefined): string {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2026-09" → "Sep 2026" (label Indonesia) */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${ID_MONTHS_SHORT[m - 1]} ${y}`;
}

export function fmtTicket(t: string | number | null | undefined): string {
  if (t === null || t === undefined) return "-";
  return String(t);
}

export const TYPE_LABEL: Record<number, string> = {
  0: "Buy",
  1: "Sell",
  2: "Balance",
  3: "Credit",
  4: "Charge",
  5: "Koreksi",
  6: "Bonus",
  7: "Komisi",
  8: "Komisi Harian",
  9: "Komisi Bulanan",
  12: "Swap",
  13: "Buy (batal)",
  14: "Sell (batal)",
  15: "Dividen",
  16: "Pajak Dividen",
};

export function typeLabel(type: number): string {
  return TYPE_LABEL[type] ?? `Tipe ${type}`;
}