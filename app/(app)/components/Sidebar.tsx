"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/history", label: "Riwayat Trade", icon: "🧾" },
  { href: "/positions", label: "Posisi Terbuka", icon: "📈" },
  { href: "/accounts", label: "Akun", icon: "👤" },
];

export default function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-lg">
          📊
        </div>
        <div>
          <div className="text-sm font-semibold">Freebuff Monitor</div>
          <div className="text-xs text-zinc-500">Monitoring Trading</div>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold">
            {username.slice(0, 1).toUpperCase()}
          </span>
          {username}
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-60"
        >
          {loggingOut ? "Keluar..." : "Keluar"}
        </button>
      </div>
    </aside>
  );
}