"use client";

import { useCallback, useEffect, useState } from "react";
import { toUsd } from "@/lib/metrics";
import Icon from "../components/Icon";

type Account = {
  id: string;
  name: string;
  broker: string;
  login: string;
  server: string;
  cent: boolean;
  token: string;
  balance: number | null;
  equity: number | null;
  currency: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  _count: { positions: number; deals: number; snapshots: number };
};

type AccountInput = {
  name: string;
  broker: string;
  login: string;
  server: string;
  investorPass: string;
  cent: boolean;
};

const EMPTY: AccountInput = {
  name: "",
  broker: "",
  login: "",
  server: "",
  investorPass: "",
  cent: false,
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Belum sinkron";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function freshOf(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 15 * 60 * 1000;
}

const fmt = (v: number | null, digits = 2) =>
  v == null
    ? "-"
    : v.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const maskToken = (t: string) =>
  t.length > 16 ? `${t.slice(0, 8)}••••••••••••${t.slice(-6)}` : "••••••••";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Gagal memuat akun");
      const data = await res.json();
      setAccounts(data.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat akun");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshStatus() {
    setSpinning(true);
    await load();
    setSpinning(false);
  }

  async function save(input: AccountInput) {
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/accounts/${editing.id}` : "/api/accounts";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Gagal menyimpan akun");
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan akun");
    } finally {
      setSaving(false);
    }
  }

  async function remove(account: Account) {
    if (!confirm(`Hapus akun "${account.name}" beserta semua data trade-nya?`)) return;
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Gagal menghapus akun");
      return;
    }
    await load();
  }

  async function regenerate(account: Account) {
    if (!confirm("Buat token bridge baru untuk akun ini? Bridge lama harus diperbarui.")) return;
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    });
    if (!res.ok) {
      setError("Gagal membuat token baru");
      return;
    }
    await load();
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} disalin ke clipboard`);
    } catch {
      prompt("Salin berikut ini:", text);
    }
  }

  const aggBalance = accounts.reduce(
    (s, a) => s + (a.balance == null ? 0 : toUsd(a.balance, a.cent)),
    0
  );
  const aggEquity = accounts.reduce(
    (s, a) => s + (a.equity == null ? 0 : toUsd(a.equity, a.cent)),
    0
  );
  const nodesLive = accounts.filter((a) => freshOf(a.lastSyncAt)).length;
  const allHealthy = accounts.length > 0 && nodesLive === accounts.length;
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <div className="w-full p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Icon name="manage_accounts" className="text-[22px] text-on-surface" />
              <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                Akun Trading
              </h1>
            </div>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              Daftar akun MT5 yang dimonitor. Token dipakai bridge di VPS.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshStatus}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-2 font-label-tabular text-body-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            >
              <Icon
                name="sync"
                className={`text-[16px] text-on-surface-variant ${spinning ? "animate-spin" : ""}`}
              />
              Refresh Status
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen((v) => !v);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 font-body-md text-body-md font-semibold text-on-secondary shadow-sm transition-all hover:opacity-90"
            >
              <Icon name={formOpen ? "close" : "add"} className="text-[18px]" />
              {formOpen ? "Batal" : "Tambah Akun"}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-container/40 px-4 py-2.5 font-body-sm text-body-sm text-on-error-container">
            <Icon name="error" className="text-[18px]" />
            {error}
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Total Akun Aktif
              </span>
              <span className="tnum mt-1 font-metric-display text-metric-display leading-none text-on-surface">
                {accounts.length}
                <span className="ml-1.5 font-body-sm text-body-sm font-normal text-on-surface-variant">
                  Node MT5
                </span>
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-low text-on-surface">
              <Icon name="hub" className="text-[20px]" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Aggregated Balance
              </span>
              <span className="tnum mt-1 font-metric-display text-metric-display leading-none text-on-surface">
                {fmt(aggBalance)}
                <span className="ml-1 font-label-caps text-label-caps font-semibold text-secondary">
                  USD
                </span>
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-low text-secondary">
              <Icon name="account_balance" className="text-[20px]" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Aggregated Equity
              </span>
              <span className="tnum mt-1 font-metric-display text-metric-display leading-none text-on-surface">
                {fmt(aggEquity)}
                <span className="ml-1 font-label-caps text-label-caps font-semibold text-secondary">
                  USD
                </span>
              </span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-low text-on-surface">
              <Icon name="trending_up" className="text-[20px]" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Status Bridge MT5
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    accounts.length === 0
                      ? "bg-outline-variant"
                      : allHealthy
                        ? "bg-secondary"
                        : nodesLive > 0
                          ? "bg-outline"
                          : "bg-error"
                  }`}
                />
                <span className="font-label-tabular text-body-sm font-semibold text-on-surface">
                  {accounts.length === 0
                    ? "Belum ada node"
                    : allHealthy
                      ? "All Nodes Normal"
                      : `${nodesLive}/${accounts.length} Node Live`}
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-container/40 text-on-secondary-container">
              <Icon name="sensors" className="text-[20px]" />
            </div>
          </div>
        </div>

        {/* Form (inline "modal" card) */}
        {formOpen && (
          <AccountForm
            key={editing?.id ?? "new"}
            initial={editing ? { ...EMPTY, ...editing, investorPass: "" } : EMPTY}
            editing={editing}
            saving={saving}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSubmit={save}
          />
        )}

        {/* Account cards */}
        {loading ? (
          <div className="rounded-xl bg-surface-container-lowest p-12 text-center text-on-surface-variant shadow-sm">
            Memuat akun...
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-14 text-center shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-on-surface">
              <Icon name="account_balance_wallet" className="text-[24px]" />
            </div>
            <p className="mt-4 font-body-md text-body-md font-medium text-on-surface">
              Belum ada akun
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Klik "+ Tambah Akun" untuk mulai.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {accounts.map((a) => {
              const fresh = freshOf(a.lastSyncAt);
              const delta = a.balance != null && a.equity != null ? a.equity - a.balance : null;
              const unit = a.cent ? "USC" : a.currency || "USD";
              return (
                <div
                  key={a.id}
                  className="relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div
                    className={`absolute left-0 right-0 top-0 h-1 ${
                      fresh ? "bg-secondary" : a.lastSyncAt ? "bg-outline-variant" : "bg-surface-variant"
                    }`}
                  />
                  {/* header */}
                  <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-headline-md text-headline-md font-bold text-on-surface">
                          {a.name}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 font-label-caps text-label-caps font-semibold ${
                            a.cent
                              ? "bg-surface-container-high text-on-surface"
                              : "bg-surface-container text-on-surface-variant"
                          }`}
                        >
                          {a.cent ? "CENT (USC)" : "STANDARD (USD)"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                        <span className="tnum">#{a.login}</span>
                        <span>•</span>
                        <span className="font-medium text-on-surface">{a.server}</span>
                        <span>•</span>
                        <span>MetaTrader 5</span>
                      </div>
                    </div>
                    <div
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${
                        fresh
                          ? "bg-secondary-container/30 text-on-secondary-container"
                          : a.lastSyncAt
                            ? "bg-surface-container-low text-on-surface-variant"
                            : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {fresh && (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
                        </span>
                      )}
                      <span className="font-label-tabular text-body-sm font-semibold">
                        {a.lastSyncAt ? `Sinkron · ${timeAgo(a.lastSyncAt)}` : "Belum sinkron"}
                      </span>
                    </div>
                  </div>

                  {/* metrics box */}
                  <div className="mb-4 grid grid-cols-2 gap-2.5 rounded-xl bg-surface-container-low p-3.5 sm:grid-cols-4">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Balance
                      </span>
                      <span className="tnum mt-0.5 font-body-lg text-body-lg font-bold text-on-surface">
                        {fmt(a.balance)}
                      </span>
                      <span className="font-label-caps text-label-caps text-on-surface-variant">
                        {unit}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Equity
                      </span>
                      <span className="tnum mt-0.5 font-body-lg text-body-lg font-bold text-on-surface">
                        {fmt(a.equity)}
                      </span>
                      <span
                        className={`font-label-caps text-label-caps ${
                          delta == null
                            ? "text-on-surface-variant"
                            : delta >= 0
                              ? "font-semibold text-secondary"
                              : "text-error"
                        }`}
                      >
                        {delta != null
                          ? `${delta >= 0 ? "+" : ""}${fmt(delta)} ${unit}`
                          : unit}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Server Sync
                      </span>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Icon
                          name={fresh ? "check_circle" : "schedule"}
                          className={`text-[14px] ${fresh ? "text-secondary" : "text-on-surface-variant"}`}
                        />
                        <span className="font-label-tabular text-body-sm font-semibold text-on-surface">
                          {timeAgo(a.lastSyncAt)}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {a._count.snapshots} snapshot
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Broker Server
                      </span>
                      <span className="mt-0.5 truncate font-body-sm text-body-sm font-semibold text-on-surface">
                        {a.server}
                      </span>
                      <span className="font-label-caps text-label-caps text-on-surface-variant">
                        {a._count.positions} posisi · {a._count.deals} deal
                      </span>
                    </div>
                  </div>

                  {/* token */}
                  <div className="mb-5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface-variant">
                        API Bridge Token (VPS Node):
                      </label>
                      <span className="flex items-center gap-1 font-body-sm text-body-sm text-secondary">
                        <Icon name="shield" className="text-[13px]" />
                        Token rahasia
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface-container p-2 font-label-tabular">
                      <div className="flex min-w-0 items-center gap-2 overflow-hidden pl-2">
                        <Icon name="key" className="text-[16px] text-on-surface-variant" />
                        <code className="tnum truncate text-body-sm font-semibold tracking-wider text-on-surface">
                          {maskToken(a.token)}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(a.token, `Token ${a.name}`)}
                        className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3 py-1.5 font-body-sm text-body-sm font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container"
                      >
                        <Icon name="content_copy" className="text-[15px]" />
                        Salin
                      </button>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-outline-variant/20 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3.5 py-1.5 font-body-sm text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <Icon name="tune" className="text-[15px]" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerate(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3.5 py-1.5 font-body-sm text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <Icon name="autorenew" className="text-[15px]" />
                      Token Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(`${origin}/api/bridge/sync`, "Endpoint sync")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3.5 py-1.5 font-body-sm text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <Icon name="wifi_tethering" className="text-[15px] text-secondary" />
                      Salin Endpoint
                    </button>
                    <div className="ml-auto">
                      <button
                        type="button"
                        onClick={() => remove(a)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-body-sm text-body-sm font-medium text-error transition-colors hover:bg-error-container/40"
                      >
                        <Icon name="delete" className="text-[16px]" />
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Guide + diagnostics */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-2">
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="dns" className="text-[22px] text-secondary" />
                  <span className="font-headline-md text-headline-md font-bold text-on-surface">
                    Petunjuk Setup Bridge MT5 VPS
                  </span>
                </div>
                <span className="rounded-full bg-surface-container-high px-2.5 py-1 font-label-caps text-label-caps font-bold uppercase text-on-surface">
                  Python Bridge
                </span>
              </div>
              <p className="mb-4 font-body-md text-body-md text-on-surface-variant">
                Hubungkan terminal MT5 di VPS Windows ke cloud monitor lewat bridge
                Python di folder{" "}
                <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-on-surface">
                  bridge/
                </code>
                .
              </p>
              <div className="flex flex-col gap-3.5">
                {/* step 1 */}
                <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest font-headline-md text-body-md font-bold text-on-surface">
                    1
                  </div>
                  <div className="min-w-0 flex-col">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">
                      Install Python &amp; library MT5
                    </span>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-surface-container px-2.5 py-2 font-mono text-body-sm">
                      <code className="select-all overflow-x-auto whitespace-nowrap text-on-surface">
                        pip install -r requirements.txt
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText("pip install -r requirements.txt", "Perintah instalasi")}
                        className="shrink-0 p-1 text-on-surface-variant transition-colors hover:text-on-surface"
                      >
                        <Icon name="content_copy" className="text-[16px]" />
                      </button>
                    </div>
                  </div>
                </div>
                {/* step 2 */}
                <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest font-headline-md text-body-md font-bold text-on-surface">
                    2
                  </div>
                  <div className="w-full flex-col">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">
                      Isi config.json — URL &amp; token akun
                    </span>
                    <p className="mb-2 mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                      Salin endpoint di atas (atau halaman ini) ke{" "}
                      <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-on-surface">
                        app_url
                      </code>
                      , lalu isi login &amp; token akun masing-masing.
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container px-2.5 py-2 font-mono text-body-sm">
                      <code className="select-all overflow-x-auto whitespace-nowrap text-on-surface">
                        {origin || "https://domain-kamu.com"}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(origin || "https://domain-kamu.com", "URL aplikasi")}
                        className="shrink-0 p-1 text-on-surface-variant transition-colors hover:text-on-surface"
                      >
                        <Icon name="content_copy" className="text-[16px]" />
                      </button>
                    </div>
                  </div>
                </div>
                {/* step 3 */}
                <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest font-headline-md text-body-md font-bold text-on-surface">
                    3
                  </div>
                  <div className="flex-col">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">
                      Jalankan bridge (mode attach terminal MT5)
                    </span>
                    <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                      Pastikan terminal MT5 (yang dipakai copier) sudah login, lalu
                      jalankan{" "}
                      <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-on-surface">
                        python mt5_bridge.py
                      </code>
                      . Untuk jalan otomatis saat VPS restart, daftarkan lewat NSSM
                      (lihat{" "}
                      <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-on-surface">
                        bridge/README.md
                      </code>
                      ).
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 pt-4">
              <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="verified" className="text-[18px]" />
                Data dikirim lewat HTTPS ke endpoint sync — dilindungi token per akun.
              </div>
            </div>
          </div>

          {/* diagnostics */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm">
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-2">
                  <Icon name="monitor_heart" className="text-[20px] text-on-surface" />
                  <span className="font-headline-md text-body-md font-bold text-on-surface">
                    Telemetry Diagnostics
                  </span>
                </div>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    allHealthy ? "bg-secondary" : accounts.length === 0 ? "bg-outline-variant" : "bg-outline"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-3 font-body-sm">
                <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Inbound Bridge Socket</span>
                    <span className={`tnum font-label-tabular font-semibold ${allHealthy ? "text-secondary" : "text-error"}`}>
                      {allHealthy ? "Operational" : accounts.length === 0 ? "Idle" : "Degraded"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full rounded-full ${allHealthy ? "bg-secondary" : "bg-outline"}`}
                      style={{ width: accounts.length === 0 ? 0 : `${(nodesLive / accounts.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Node Terhubung</span>
                    <span className="tnum font-label-tabular font-semibold text-on-surface">
                      {nodesLive}/{accounts.length}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div
                      className="h-full rounded-full bg-on-surface"
                      style={{ width: accounts.length === 0 ? 0 : `${(nodesLive / accounts.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Sinkronisasi Data</span>
                    <span className="tnum font-label-tabular font-semibold text-secondary">Active</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full rounded-full bg-secondary" style={{ width: "100%" }} />
                  </div>
                </div>
                {/* log preview */}
                <div className="mt-2 flex flex-col gap-1 overflow-hidden rounded-xl bg-surface p-3 font-mono text-body-sm text-on-surface-variant">
                  <span className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
                    Recent Node Events
                  </span>
                  {accounts.length === 0 ? (
                    <div className="text-on-surface-variant">— belum ada akun —</div>
                  ) : (
                    accounts.map((a) => (
                      <div key={a.id} className={`truncate ${freshOf(a.lastSyncAt) ? "text-secondary" : ""}`}>
                        {timeAgo(a.lastSyncAt)} · {a.name} · {a._count.positions} posisi
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="pt-4">
              <a
                href="/history"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-surface-container-low p-2.5 font-body-sm text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                <Icon name="terminal" className="text-[18px]" />
                Lihat Riwayat Trade
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- form akun ---------- */
function AccountForm({
  initial,
  editing,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: AccountInput;
  editing: Account | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (v: AccountInput) => void;
}) {
  const [form, setForm] = useState<AccountInput>(initial);

  const field =
    "w-full rounded-xl bg-surface-container px-3.5 py-2 font-body-md text-body-md text-on-surface outline-none transition-colors focus:bg-surface-container-high placeholder:text-outline";

  return (
    <div className="flex flex-col rounded-xl bg-surface-container-lowest p-6 shadow-md">
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Icon name="account_balance_wallet" className="text-[24px] text-secondary" />
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
            {editing ? `Edit Akun: ${editing.name}` : "Tambah Akun MT5"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1 text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <Icon name="close" className="text-[20px]" />
        </button>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
            Nama Label Akun *
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Contoh: Scalper Emas M1"
            className={field}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
              Nomor Akun MT5 *
            </label>
            <input
              required
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              placeholder="471580123"
              inputMode="numeric"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
              Tipe Akun
            </label>
            <select
              value={form.cent ? "cent" : "standard"}
              onChange={(e) => setForm({ ...form, cent: e.target.value === "cent" })}
              className={`${field} cursor-pointer`}
            >
              <option value="standard">Standard (USD)</option>
              <option value="cent">Cent (USC)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
              Broker *
            </label>
            <input
              required
              value={form.broker}
              onChange={(e) => setForm({ ...form, broker: e.target.value })}
              placeholder="mis. Valetax"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
              Server MT5 *
            </label>
            <input
              required
              value={form.server}
              onChange={(e) => setForm({ ...form, server: e.target.value })}
              placeholder="ValetaxIntl-Live2"
              className={field}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-label-caps text-label-caps font-semibold uppercase text-on-surface">
            Password Investor{" "}
            <span className="font-normal normal-case text-on-surface-variant">
              (opsional — dipakai mode login langsung bridge)
            </span>
          </label>
          <input
            type="password"
            value={form.investorPass}
            onChange={(e) => setForm({ ...form, investorPass: e.target.value })}
            placeholder={editing ? "Kosongkan = tetap" : "••••••••"}
            autoComplete="off"
            className={field}
          />
        </div>
        <div className="flex items-start gap-2.5 rounded-xl bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">
          <Icon name="info" className="mt-0.5 text-[18px] text-secondary" />
          <span>
            Setelah akun ditambahkan, API Token otomatis dibuat — masukkan token
            tersebut di <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-on-surface">config.json</code> bridge VPS.
          </span>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-surface-container-low px-4 py-2 font-body-md text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-secondary px-5 py-2 font-body-md text-body-md font-semibold text-on-secondary shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
          >
            {saving
              ? "Menyimpan..."
              : editing
                ? "Simpan Perubahan"
                : "Simpan & Generate Token"}
          </button>
        </div>
      </form>
    </div>
  );
}
