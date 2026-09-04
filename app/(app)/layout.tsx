import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "./components/Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar username={session.username} />
      <main className="flex-1 overflow-x-hidden px-6 py-6 lg:px-10">{children}</main>
    </div>
  );
}