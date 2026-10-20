"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { setCurrencyMode, type CurrencyMode } from "@/lib/format";

/** Pilihan tampilan uang untuk akun cent: USD (÷100) atau USC apa adanya.
 *  Disimpan di cookie `currency` supaya SSR (layout) memakai pilihan yang sama. */

interface CurrencyContextValue {
  mode: CurrencyMode;
  toggle: () => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  mode: "usd",
  toggle: () => {},
});

export default function CurrencyProvider({
  initial,
  children,
}: {
  initial: CurrencyMode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<CurrencyMode>(initial);

  // Sinkronkan flag global formatter di sisi client (chart, snapshot).
  useEffect(() => {
    setCurrencyMode(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: CurrencyMode = prev === "usd" ? "usc" : "usd";
      setCurrencyMode(next);
      document.cookie = `currency=${next}; path=/; max-age=${
        60 * 60 * 24 * 365
      }; samesite=lax`;
      // Kartu dashboard/riwayat/posisi dirender server component berdasarkan
      // cookie — refresh agar seluruh nilai uang ikut berganti satuan.
      router.refresh();
      return next;
    });
  }, [router]);

  return (
    <CurrencyContext.Provider value={{ mode, toggle }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
