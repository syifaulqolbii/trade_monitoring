"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

const NAV = [
  { href: "/", label: "Dashboard", icon: "query_stats" },
  { href: "/positions", label: "Posisi", icon: "candlestick_chart" },
  { href: "/history", label: "Riwayat", icon: "receipt_long" },
  { href: "/accounts", label: "Akun", icon: "account_balance_wallet" },
];

/** Bottom tab bar — hanya tampil di layar kecil (mockup mobile). */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant/20 bg-surface-container-lowest/95 pb-safe shadow-[0_-2px_10px_rgba(15,23,42,0.03)] backdrop-blur-xl lg:hidden">
      <div className="flex h-16 items-center justify-around px-1">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-secondary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={item.icon} className="text-[22px]" />
              <span className="font-label-caps text-label-caps">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
