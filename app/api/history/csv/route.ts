import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildHistory, filterRows, type DealRow } from "@/lib/history";

export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const acc = url.searchParams.get("acc") ?? undefined;

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, cent: true },
  });
  if (accounts.length === 0) return new Response("Tidak ada akun", { status: 404 });
  const account = accounts.find((a) => a.id === acc) ?? accounts[0];

  const deals = (await prisma.deal.findMany({
    where: { accountId: account.id },
    select: {
      positionId: true,
      ticket: true,
      symbol: true,
      type: true,
      direction: true,
      volume: true,
      price: true,
      profit: true,
      commission: true,
      swap: true,
      fee: true,
      time: true,
    },
    orderBy: { time: "asc" },
  })) as unknown as DealRow[];

  const cent = account.cent;
  const rows = filterRows(buildHistory(deals), {
    symbol: url.searchParams.get("symbol") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });

  const fmtD = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const num = (v: number, digits = 2) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const header = [
    "Tiket",
    "Simbol",
    "Tipe",
    cent ? "Lot (Std)" : "Lot",
    "Harga Buka",
    "Harga Tutup",
    "Waktu Buka",
    "Waktu Tutup",
    "Profit",
    "Komisi",
    "Swap",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    const lot = cent ? r.volume / 100 : r.volume;
    lines.push(
      [
        r.positionId,
        r.symbol,
        r.type.toUpperCase(),
        num(lot, 4),
        num(r.openPrice, 5),
        num(r.closePrice, 5),
        fmtD(r.openTime),
        fmtD(r.closeTime),
        num(r.netProfit),
        num(r.commission),
        num(r.swap),
      ]
        .map(csvCell)
        .join(";")
    );
  }

  const body = "\uFEFF" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="riwayat-${account.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stamp}.csv"`,
    },
  });
}
