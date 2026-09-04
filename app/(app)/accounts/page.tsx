"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function copyToken(account: Account) {
    try {
      await navigator.clipboard.writeText(account.token);
      alert("Token disalin ke clipboard");
    } catch {
      prompt("Salin token berikut:", account.token);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Akun Trading</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Daftar akun MT5 yang dimonitor. Token dipakai bridge di VPS.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen((v) => !v);
          }}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          {formOpen ? "Batal" : "+ Tambah Akun"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

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

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center text-zinc-500">
          Memuat...
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center">
          <div className="text-3xl">📭</div>
          <p className="mt-2 text-zinc-400">Belum ada akun.</p>
          <p className="text-sm text-zinc-600">
            Klik "+ Tambah Akun" untuk mulai.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{a.name}</h2>
                    {a.cent && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                        CENT (USC)
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {a.broker} · {a.login} · {a.server}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                    a.lastSyncAt
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {a.lastSyncAt ? "● Sinkron" : "○ Pasif"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-zinc-950/60 p-3 text-center">
                <div>
                  <div className="text-[11px] text-zinc-500">Balance</div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {a.balance != null ? a.balance.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">Equity</div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {a.equity != null ? a.equity.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">Sync</div>
                  <div className="mt-0.5 text-sm font-semibold">{timeAgo(a.lastSyncAt)}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-950/60 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-zinc-400">
                  {a.token.slice(0, 12)}••••••••••••{a.token.slice(-6)}
                </code>
                <button
                  onClick={() => copyToken(a)}
                  className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
                >
                  Salin
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setEditing(a);
                    setFormOpen(true);
                  }}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500"
                >
                  Edit
                </button>
                <button
                  onClick={() => regenerate(a)}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-amber-500/60 hover:text-amber-400"
                >
                  Token Baru
                </button>
                <button
                  onClick={() => remove(a)}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-red-500/60 hover:text-red-400"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  return (
    <div className="mb-6 rounded-xl border border-emerald-500/30 bg-zinc-900 p-5">
      <h2 className="mb-4 font-semibold">
        {editing ? `Edit Akun: ${editing.name}` : "Tambah Akun Baru"}
      </h2>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Nama Akun *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="mis. Akun Utama"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Broker *</label>
          <input
            required
            value={form.broker}
            onChange={(e) => setForm({ ...form, broker: e.target.value })}
            placeholder="mis. ICMarkets"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Login *</label>
          <input
            required
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            placeholder="mis. 12345678"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Server *</label>
          <input
            required
            value={form.server}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            placeholder="mis. ICMarkets-Live"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Password Investor {editing && <span className="text-zinc-600">(kosongkan = tetap)</span>}
          </label>
          <input
            type="password"
            value={form.investorPass}
            onChange={(e) => setForm({ ...form, investorPass: e.target.value })}
            placeholder="hanya untuk sinkronisasi, dienkripsi"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.cent}
              onChange={(e) => setForm({ ...form, cent: e.target.checked })}
              className="h-4 w-4 accent-emerald-500"
            />
            Akun cent (USC) — nilai otomatis dikonversi ke USD (÷100)
          </label>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Akun"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}