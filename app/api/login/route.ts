import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { checkCredentials } from "@/lib/auth";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return Response.json({ error: "Username dan password wajib diisi" }, { status: 400 });
  }

  const ok = await checkCredentials(username, password);
  if (!ok) {
    return Response.json({ error: "Username atau password salah" }, { status: 401 });
  }

  const token = createSession(username);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return Response.json({ ok: true });
}