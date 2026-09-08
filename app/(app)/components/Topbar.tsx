"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import Icon from "./Icon";
import { usePrivacy } from "./PrivacyProvider";

export interface TopbarAccount {
  id: string;
  name: string;
  login: string;
  server: string;
  lastSyncAt: string | null;
}

function fmtSync(iso: string | null): string {
  if (!iso) return "Belum sinkron";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Belum sinkron";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Baru saja";
  if (diff < 10 * 60_000)
    return `Sinkron ${Math.floor(diff / 60000)} mnt lalu`;
  return `Sinkron ${d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function liveLevel(iso: string | null): "live" | "stale" | "none" {
  if (!iso) return "none";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3 * 60_000) return "live";
  if (diff < 60 * 60_000) return "stale";
  return "none";
}

export default function Topbar({ accounts }: { accounts: TopbarAccount[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { privacy, toggle: togglePrivacy } = usePrivacy();

  const activeId = useMemo(
    () => searchParams.get("acc") ?? accounts[0]?.id ?? "",
    [searchParams, accounts]
  );
  const active =
    accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;

  const go = useCallback(
    (id: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (!id) p.delete("acc");
      else p.set("acc", id);
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
    },
    [searchParams, pathname, router]
  );

  const level = liveLevel(active?.lastSyncAt ?? null);

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface-container-lowest/90 px-4 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-md lg:left-64 lg:h-16 lg:px-6">
      <div className="flex min-w-0 items-center gap-4">
        {/* Account switcher */}
        {accounts.length > 0 ? (
          <div className="relative flex min-w-0 items-center">
            <Icon
              name="account_tree"
              className="pointer-events-none absolute left-3 text-[18px] text-on-surface"
            />
            <select
              aria-label="Pilih akun"
              value={active?.id ?? ""}
              onChange={(e) => go(e.target.value)}
              className="w-full max-w-[240px] cursor-pointer appearance-none truncate rounded-xl border border-outline-variant/30 bg-surface-container-low py-1.5 pl-9 pr-8 font-body-md text-body-md font-semibold text-on-surface outline-none transition-colors hover:bg-surface-container max-[430px]:max-w-[130px]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} - {a.login}
                </option>
              ))}
            </select>
            <Icon
              name="expand_more"
              className="pointer-events-none absolute right-2 text-[16px] text-on-surface-variant"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-1.5">
            <Icon
              name="account_tree"
              className="text-[18px] text-on-surface-variant"
            />
            <span className="font-body-md text-body-md font-medium text-on-surface-variant">
              Belum ada akun
            </span>
          </div>
        )}

        {/* Sync pill */}
        {active && (
          <div
            className={`hidden items-center gap-2 rounded-full border px-2.5 py-1 xl:flex ${
              level === "none"
                ? "border-outline-variant/40 bg-surface-container-low"
                : level === "stale"
                  ? "border-outline-variant/50 bg-surface-container-low"
                  : "border-secondary/20 bg-secondary-container/40"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                level === "live"
                  ? "animate-pulse bg-secondary"
                  : level === "stale"
                    ? "bg-outline"
                    : "bg-outline-variant"
              }`}
            />
            <span
              className={`whitespace-nowrap font-label-tabular text-body-sm font-medium ${
                level === "none"
                  ? "text-on-surface-variant"
                  : "text-on-secondary-container"
              }`}
            >
              {fmtSync(active.lastSyncAt)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {active && (
          <div className="hidden min-w-0 flex-col items-end leading-tight md:flex">
            <span className="max-w-[160px] truncate font-body-md text-body-md font-semibold text-on-surface">
              {active.name}
            </span>
            <span className="max-w-[180px] truncate font-label-caps text-label-caps text-on-surface-variant">
              {active.login} · {active.server}
            </span>
          </div>
        )}
        <div className="hidden h-5 w-px bg-outline-variant/30 sm:block" />
        <button
          type="button"
          onClick={togglePrivacy}
          title={
            privacy
              ? "Tampilkan nilai uang (mata terbuka)"
              : "Sembunyikan nilai uang (mata tertutup) — semua $ jadi $----"
          }
          aria-label={
            privacy ? "Tampilkan nilai uang" : "Sembunyikan nilai uang"
          }
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
            privacy
              ? "bg-tertiary-fixed text-on-tertiary-container"
              : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          }`}
        >
          <Icon
            name={privacy ? "visibility_off" : "visibility"}
            className="text-[20px]"
          />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
            <Icon name="person" className="text-[18px]" />
          </div>
        </div>
      </div>
    </header>
  );
}
