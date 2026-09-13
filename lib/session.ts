import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session stateless: payload base64url + HMAC-SHA256 signature.
 * Modul ini murni (tanpa import next/headers/bcrypt) agar aman
 * dipakai di proxy.ts (edge/node runtime).
 */

export const SESSION_COOKIE = "freebuff_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  // Produksi tanpa secret = session bisa dipalsukan siapa pun — tolak keras.
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET wajib di-set di .env (32 byte hex)");
  }
  return secret ?? "freebuff-dev-secret-change-me"; // default khusus dev
}

export function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function verifySig(payload: string, sig: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SessionValue = { username: string; exp: number };

export function createSession(username: string): string {
  const value: SessionValue = { username, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(
  token: string | undefined | null
): SessionValue | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!verifySig(payload, sig)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SessionValue;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}