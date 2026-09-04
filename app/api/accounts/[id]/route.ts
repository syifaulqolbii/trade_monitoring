import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

type RouteCtx = RouteContext<"/api/accounts/[id]">;

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  let body: {
    name?: string;
    broker?: string;
    login?: string;
    server?: string;
    investorPass?: string;
    cent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON" }, { status: 400 });
  }

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Akun tidak ditemukan" }, { status: 404 });

  const name = (body.name ?? "").trim();
  const broker = (body.broker ?? "").trim();
  const login = (body.login ?? "").trim();
  const server = (body.server ?? "").trim();

  if (!name || !broker || !login || !server) {
    return Response.json(
      { error: "Nama, broker, login, dan server wajib diisi" },
      { status: 400 }
    );
  }

  const account = await prisma.account.update({
    where: { id },
    data: {
      name,
      broker,
      login,
      server,
      // password investor kosong = biarkan lama
      investorPass: body.investorPass ? encryptSecret(body.investorPass) : existing.investorPass,
      cent: body.cent ?? existing.cent,
    },
  });

  return Response.json({ account });
}

export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Akun tidak ditemukan" }, { status: 404 });

  await prisma.account.delete({ where: { id } });
  return Response.json({ ok: true });
}

/** Regenerasi token bridge (PATCH dengan { regenerateToken: true }) */
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Akun tidak ditemukan" }, { status: 404 });

  const account = await prisma.account.update({
    where: { id },
    data: { token: randomBytes(24).toString("hex") },
  });

  return Response.json({ account });
}