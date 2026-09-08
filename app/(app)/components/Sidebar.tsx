"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";

const NAV = [
  { href: "/", label: "Dashboard", icon: "query_stats" },
  { href: "/history", label: "Riwayat Trade", icon: "receipt_long" },
  { href: "/positions", label: "Posisi Terbuka", icon: "candlestick_chart" },
  { href: "/accounts", label: "Akun", icon: "account_balance_wallet" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "Belum sinkron";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export default function Sidebar({
  username,
  lastSyncAt,
}: {
  username: string;
  lastSyncAt: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const fresh = lastSyncAt
    ? Date.now() - new Date(lastSyncAt).getTime() < 10 * 60 * 1000
    : false;

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-64 select-none flex-col justify-between border-r border-outline-variant/30 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-outline-variant/20 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icon name="diamond" className="text-[18px]" filled />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-headline-md text-body-md font-bold tracking-tight text-on-surface">
              KuFXBuku
            </span>
            <span className="mt-0.5 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Trade Monitoring &amp; Journal
            </span>
          </div>
        </div>

        {/* Nav label */}
        <div className="px-5 pb-2 pt-6">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Navigasi Utama
          </span>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 font-body-md text-body-md transition-colors ${
                  active
                    ? "bg-surface-container font-semibold text-on-surface"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <Icon name={item.icon} className="text-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: bridge status + user */}
      <div className="flex flex-col gap-3 border-t border-outline-variant/20 bg-surface-container-lowest p-5">
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low p-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75 ${
                  fresh ? "animate-ping" : ""
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  fresh ? "bg-secondary" : "bg-outline"
                }`}
              />
            </span>
            <span className="font-label-caps text-label-caps font-semibold tracking-wide text-on-surface">
              MT5 Bridge
            </span>
          </div>
          <span
            className={`font-label-tabular text-body-sm font-semibold ${
              fresh ? "text-secondary" : "text-on-surface-variant"
            }`}
          >
            {fresh ? "Live" : timeAgo(lastSyncAt)}
          </span>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-body-md text-body-md font-semibold leading-tight text-on-surface">
              {username}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Admin Console
            </span>
          </div>
          <Icon name="verified_user" className="text-[18px] text-outline" />
        </div>

        <button
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
        >
          <Icon name="logout" className="text-[16px] text-on-surface-variant" />
          {loggingOut ? "Keluar..." : "Keluar"}
        </button>
      </div>
    </aside>
  );
}
