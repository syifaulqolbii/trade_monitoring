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
import { setPrivacyMode } from "@/lib/format";

const COOKIE_NAME = "privacy";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 tahun

interface PrivacyContextValue {
  /** true = mata tertutup (nilai uang disembunyikan jadi $----) */
  privacy: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  privacy: false,
  toggle: () => {},
});

function writeCookie(on: boolean) {
  document.cookie = `${COOKIE_NAME}=${on ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export default function PrivacyProvider({
  initial,
  children,
}: {
  initial: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [privacy, setPrivacy] = useState(initial);

  // Sinkronkan flag global formatter di sisi client (untuk komponen client
  // seperti chart) setiap kali state berubah.
  useEffect(() => {
    setPrivacyMode(privacy);
  }, [privacy]);

  const toggle = useCallback(() => {
    setPrivacy((p) => {
      const next = !p;
      setPrivacyMode(next);
      writeCookie(next);
      // Kartu dashboard/riwayat/posisi dirender server component berdasarkan
      // cookie — refresh agar semua nilai $ langsung berubah ke $---- (atau
      // sebaliknya) tanpa reload penuh halaman.
      router.refresh();
      return next;
    });
  }, [router]);

  return (
    <PrivacyContext.Provider value={{ privacy, toggle }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext);
}
