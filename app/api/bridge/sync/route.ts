import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { processSync, type SyncPayload } from "@/lib/sync";
import { safeEqual } from "@/lib/crypto";

/**
 * Endpoint yang dipanggil bridge Python dari VPS.
 * Autentikasi: header `Authorization: Bearer <token-akun>`
 * (token unik per akun, ditampilkan di halaman Akun).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return Response.json({ error: "Token tidak ditemukan" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({ select: { id: true, token: true } });
  const account = accounts.find((a) => safeEqual(a.token, token));

  if (!account) {
    return Response.json({ error: "Token tidak valid" }, { status: 401 });
  }

  let payload: SyncPayload;
  try {
    payload = (await request.json()) as SyncPayload;
  } catch {
    return Response.json({ error: "Body harus JSON" }, { status: 400 });
  }

  if (!payload || !payload.account || !Array.isArray(payload.positions) || !Array.isArray(payload.deals)) {
    return Response.json(
      { error: "Format payload salah: butuh account, positions[], deals[]" },
      { status: 400 }
    );
  }

  try {
    const result = await processSync(account.id, payload);
    return Response.json(result);
  } catch (err) {
    console.error("Sync error:", err);
    return Response.json({ error: "Gagal memproses sinkronisasi" }, { status: 500 });
  }
}