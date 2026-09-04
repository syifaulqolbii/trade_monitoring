import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSession,
  verifySession,
  type SessionValue,
} from "./session";

export { SESSION_COOKIE, createSession, verifySession } from "./session";
export type { SessionValue } from "./session";

/** Baca session dari cookie request (Server Component / Route Handler) */
export async function getSession(): Promise<SessionValue | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Cek kredensial login single-user dari env.
 * AUTH_PASSWORD bisa plaintext (default dev) atau bcrypt hash ($2...).
 */
export async function checkCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const expectedUser = process.env.AUTH_USERNAME ?? "admin";
  const expectedPass = process.env.AUTH_PASSWORD ?? "admin123";
  if (username !== expectedUser) return false;
  if (expectedPass.startsWith("$2")) {
    try {
      return await bcrypt.compare(password, expectedPass);
    } catch {
      return false;
    }
  }
  return password === expectedPass;
}