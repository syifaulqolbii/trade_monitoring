"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../(app)/components/Icon";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login gagal");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-xl bg-surface-container-low px-3.5 py-2.5 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:bg-surface-container-lowest focus:ring-1 focus:ring-outline";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-on-primary">
              <Icon name="diamond" className="text-[24px]" filled />
            </div>
            <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
              KuFXBuku
            </h1>
            <p className="mt-1 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Trade Monitoring &amp; Journal
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="font-label-caps text-label-caps font-semibold uppercase text-on-surface-variant"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="font-label-caps text-label-caps font-semibold uppercase text-on-surface-variant"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={field}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-container/40 px-3 py-2 font-body-sm text-body-sm text-on-error-container">
                <Icon name="error" className="text-[16px]" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-body-md text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Icon name="sync" className="animate-spin text-[16px]" />
                  Memproses...
                </>
              ) : (
                <>
                  Masuk
                  <Icon name="arrow_forward" className="text-[16px]" />
                </>
              )}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center font-label-caps text-label-caps text-outline">
          Akses terbatas — kredensial dari administrator
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
