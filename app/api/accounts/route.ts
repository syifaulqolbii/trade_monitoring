import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { positions: true, deals: true, snapshots: true } },
    },
  });

  return Response.json({ accounts });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  const account = await prisma.account.create({
    data: {
      name,
      broker,
      login,
      server,
      investorPass: body.investorPass ? encryptSecret(body.investorPass) : null,
      cent: body.cent ?? false,
      token: randomBytes(24).toString("hex"),
    },
  });

  return Response.json({ account }, { status: 201 });
}