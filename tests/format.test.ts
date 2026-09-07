import { describe, it, expect } from "vitest";
import { fmtLots, fmtMoney, setPrivacyMode } from "@/lib/format";

describe("fmtLots", () => {
  it("akun standar: nilai apa adanya, maks 2 desimal", () => {
    expect(fmtLots(1)).toBe("1");
    expect(fmtLots(1.25)).toBe("1.25");
    expect(fmtLots(1.256)).toBe("1.26");
    expect(fmtLots(null)).toBe("-");
  });

  it("akun cent: dikonversi ke lot standar (÷100) dengan desimal secukupnya", () => {
    expect(fmtLots(1, { cent: true })).toBe("0.01");
    expect(fmtLots(45, { cent: true })).toBe("0.45");
    expect(fmtLots(150, { cent: true })).toBe("1.5");
    expect(fmtLots(0.5, { cent: true })).toBe("0.005");
    expect(fmtLots(undefined, { cent: true })).toBe("-");
  });
});

describe("fmtMoney", () => {
  it("akun cent: USC dikonversi ke USD (÷100)", () => {
    setPrivacyMode(false);
    expect(fmtMoney(30566.71, { cent: true })).toBe("$305.67");
    expect(fmtMoney(1250, { cent: true })).toBe("$12.50");
  });

  it("akun standar: nilai apa adanya", () => {
    expect(fmtMoney(1000, { cent: false })).toBe("$1,000.00");
  });
});

describe("mode privasi (mata buka/tutup)", () => {
  it("menyembunyikan semua nilai uang dengan $----", () => {
    setPrivacyMode(true);
    expect(fmtMoney(30566.71, { cent: true })).toBe("$----");
    expect(fmtMoney(-42.3, { cent: false })).toBe("$----");
    expect(fmtMoney(0, { cent: true })).toBe("$----");
  });

  it("tidak mengubah lot dan persen", () => {
    expect(fmtLots(45, { cent: true })).toBe("0.45");
  });

  it("kembali normal saat dimatikan", () => {
    setPrivacyMode(false);
    expect(fmtMoney(30566.71, { cent: true })).toBe("$305.67");
  });
});
