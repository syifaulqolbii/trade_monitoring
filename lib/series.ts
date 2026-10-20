/**
 * Downsample deret terurut (berdasarkan waktu) untuk chart.
 *
 * Titik pertama & terakhir selalu dipertahankan supaya rentang dan nilai
 * terkini tidak berubah. Dipakai di server SEBELUM data dikirim ke client:
 * snapshot 30 detik bisa ratusan ribu titik, sementara chart hanya butuh
 * ~200-300 titik. Tanpa ini payload RSC membengkak puluhan MB.
 */
export function downsampleSeries<T>(points: readonly T[], max: number): T[] {
  const n = points.length;
  if (n <= max || max < 2) return points.slice();

  const step = (n - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) {
    out.push(points[Math.round(i * step)]);
  }
  out.push(points[n - 1]);
  return out;
}
