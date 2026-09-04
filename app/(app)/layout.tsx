import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      login: true,
      server: true,
      lastSyncAt: true,
    },
  });

  // sync terbaru dari akun mana pun — untuk indikator "MT5 Bridge" di sidebar
  const lastSyncAt =
    accounts.reduce<string | null>((acc, a) => {
      if (!a.lastSyncAt) return acc;
      const t = a.lastSyncAt.toISOString();
      return !acc || t > acc ? t : acc;
    }, null) ?? null;

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar username={session.username} lastSyncAt={lastSyncAt} />
      <div className="pl-64">
        <Topbar
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            login: a.login,
            server: a.server,
            lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
          }))}
        />
        <main className="min-h-screen bg-surface pb-10 pt-16">
          {children}
        </main>
      </div>
    </div>
  );
}
