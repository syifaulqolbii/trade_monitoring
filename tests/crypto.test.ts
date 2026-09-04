import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret, safeEqual } from "@/lib/crypto";
import { createSession, verifySession } from "@/lib/session";

describe("crypto: enkripsi password investor", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY =
      "d9211f7c50bb9e4ccf5de5c629d17d0e2a94ded38042cbded67cbf0332e56f37";
  });

  it("round-trip enkripsi → dekripsi", () => {
    const secret = "InvestorPass123!";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("menghasilkan ciphertext berbeda tiap kali (random IV)", () => {
    const secret = "sama";
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it("safeEqual membedakan string berbeda", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc123", "abc")).toBe(false);
  });
});

describe("session: tanda tangan HMAC", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret";
  });

  it("verifySession menerima token valid", () => {
    const token = createSession("admin");
    const session = verifySession(token);
    expect(session?.username).toBe("admin");
    expect(session?.exp).toBeGreaterThan(Date.now());
  });

  it("menolak token yang dimodifikasi", () => {
    const token = createSession("admin");
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifySession(tampered)).toBeNull();
  });

  it("menolak token garbage", () => {
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession(null)).toBeNull();
  });

  it("menolak session yang sudah kedaluwarsa", () => {
    const expired = Buffer.from(
      JSON.stringify({ username: "admin", exp: Date.now() - 1000 })
    ).toString("base64url");
    // tanda tangani manual dengan secret yang sama
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const sig = createHmac("sha256", "test-secret")
      .update(expired)
      .digest("base64url");
    expect(verifySession(`${expired}.${sig}`)).toBeNull();
  });
});