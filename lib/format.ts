import { toStdLots, toUsd } from "./metrics";

/**
 * Mode privasi global ("mata tertutup"): saat aktif, fmtMoney menyembunyikan
 * SEMUA nilai uang sebagai "$----" — dipakai di web maupun snapshot image.
 * Diubah via setPrivacyMode() dari PrivacyProvider (disimpan di cookie).
 */
let privacyMode = false;

export function setPrivacyMode(on: boolean): void {
  privacyMode = on;
}

export function getPrivacyMode(): boolean {
  return privacyMode;
}

export const PRIVACY_MASK = "$----";

/** Format angka uang; cent=true → tampilkan dalam USD (USC/100). */
export function fmtMoney(
  v: number | null | undefined,
  opts: { cent?: boolean; digits?: number; symbol?: string } = {}
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  if (privacyMode) return PRIVACY_MASK;
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

/** Format lot; cent=true → konversi ke lot standar (lot cent ÷ 100),
 *  mis. 1.0 lot cent = 0.01 lot standar (kontrak 1 lot = 1.000 unit). */
export function fmtLots(
  v: number | null | undefined,
  opts: { cent?: boolean } = {}
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const cent = opts.cent ?? false;
  const x = cent ? toStdLots(v, true) : v;
  // lot standar bisa sangat kecil (mis. 0.005) — tampilkan desimal secukupnya
  const maxDigits = cent ? (x >= 1 ? 2 : x >= 0.01 ? 3 : 4) : 2;
  return x.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
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
