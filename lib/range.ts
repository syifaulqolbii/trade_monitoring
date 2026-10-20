export type RangeKey = "day" | "week" | "month" | "all";

export const RANGES: { key: RangeKey; label: string; badge: string }[] = [
  { key: "day", label: "Hari Ini", badge: "1D" },
  { key: "week", label: "Minggu Ini", badge: "7D" },
  { key: "month", label: "Bulan Ini", badge: "MTD" },
  { key: "all", label: "Semua", badge: "ALL" },
];

/** Awal rentang (waktu lokal server): day→00:00 hari ini, week→7 hari, month→awal bulan */
export function rangeStartMs(key: RangeKey, now = new Date()): number | undefined {
  if (key === "all") return undefined;
  if (key === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  if (key === "week") return now.getTime() - 7 * 24 * 3600 * 1000;
  // month
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export function parseRange(v: string | undefined): RangeKey {
  if (v === "day" || v === "week" || v === "month" || v === "all") return v;
  return "month";
}
